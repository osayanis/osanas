package main

import (
	"bufio"
	"context"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Échantillonnage en continu (toutes les 2 s) : CPU et débit réseau sont des écarts entre deux mesures.
var (
	liveMu     sync.Mutex
	liveCPU    = -1
	liveRx     = -1.0
	liveTx     = -1.0
	smartMu    sync.Mutex
	smartCache = map[string]smartInfo{}
)

type smartInfo struct {
	Health string // ok | bad | sleep | unknown
	Temp   int
	At     time.Time
}

func sampler() {
	pi, pt := cpuStat()
	prx, ptx := netBytes()
	pts := time.Now()
	for {
		time.Sleep(2 * time.Second)
		i, t := cpuStat()
		rx, tx := netBytes()
		now := time.Now()
		dt := now.Sub(pts).Seconds()
		liveMu.Lock()
		if t > pt {
			liveCPU = int(100*(1-float64(i-pi)/float64(t-pt)) + 0.5)
		}
		if dt > 0 && rx >= prx && tx >= ptx {
			liveRx = float64(rx-prx) / dt
			liveTx = float64(tx-ptx) / dt
		}
		liveMu.Unlock()
		pi, pt, prx, ptx, pts = i, t, rx, tx, now
	}
}

func cpuStat() (idle, total uint64) {
	b, _ := os.ReadFile("/proc/stat")
	line, _, _ := strings.Cut(string(b), "\n")
	f := strings.Fields(line)
	for k := 1; k < len(f); k++ {
		v, _ := strconv.ParseUint(f[k], 10, 64)
		total += v
		if k == 4 || k == 5 {
			idle += v
		}
	}
	return
}

// Interface de la route par défaut (eth0 sous Alt-F).
func mainIface() (name, gw string) {
	b, _ := os.ReadFile("/proc/net/route")
	for _, l := range strings.Split(string(b), "\n")[1:] {
		f := strings.Fields(l)
		if len(f) > 2 && f[1] == "00000000" {
			g, _ := strconv.ParseUint(f[2], 16, 32)
			return f[0], net.IPv4(byte(g), byte(g>>8), byte(g>>16), byte(g>>24)).String()
		}
	}
	return "eth0", ""
}

func netBytes() (rx, tx uint64) {
	ifc, _ := mainIface()
	b, _ := os.ReadFile("/proc/net/dev")
	for _, l := range strings.Split(string(b), "\n") {
		name, rest, ok := strings.Cut(l, ":")
		if !ok || strings.TrimSpace(name) != ifc {
			continue
		}
		f := strings.Fields(rest)
		if len(f) >= 9 {
			rx, _ = strconv.ParseUint(f[0], 10, 64)
			tx, _ = strconv.ParseUint(f[8], 10, 64)
		}
	}
	return
}

func readTrim(p string) string { b, _ := os.ReadFile(p); return strings.TrimSpace(string(b)) }
func readInt(p string) (int, bool) {
	v, err := strconv.Atoi(readTrim(p))
	return v, err == nil
}

func meminfo() (total, used uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()
	m := map[string]uint64{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		n, _ := strconv.ParseUint(strings.Fields(v)[0], 10, 64)
		m[k] = n * 1024
	}
	avail := m["MemAvailable"]
	if avail == 0 {
		avail = m["MemFree"] + m["Buffers"] + m["Cached"]
	}
	return m["MemTotal"], m["MemTotal"] - avail
}

func status() map[string]any {
	ifc, gw := mainIface()
	ip, mac := "", ""
	if i, err := net.InterfaceByName(ifc); err == nil {
		mac = strings.ToUpper(i.HardwareAddr.String())
		if as, _ := i.Addrs(); len(as) > 0 {
			for _, a := range as {
				if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil {
					ip = n.IP.String()
				}
			}
		}
	}
	host, _ := os.Hostname()
	up := 0.0
	if f := strings.Fields(readTrim("/proc/uptime")); len(f) > 0 {
		up, _ = strconv.ParseFloat(f[0], 64)
	}
	load := 0.0
	if f := strings.Fields(readTrim("/proc/loadavg")); len(f) > 0 {
		load, _ = strconv.ParseFloat(f[0], 64)
	}
	var temp, fan any
	if t, ok := readInt("/tmp/sys/temp1_input"); ok {
		temp = (t + 500) / 1000
	}
	if v, ok := readInt("/tmp/sys/fan1_input"); ok {
		fan = v
	}
	mt, mu := meminfo()

	var st syscall.Statfs_t
	vol := map[string]any{"name": "Volume_1", "mounted": false, "total": 0, "free": 0}
	if syscall.Statfs(root, &st) == nil && isMountpoint(root) {
		vol["mounted"] = true
		vol["total"] = float64(st.Blocks) * float64(st.Bsize)
		vol["free"] = float64(st.Bavail) * float64(st.Bsize)
	}

	liveMu.Lock()
	var cpu, rx, tx any
	if liveCPU >= 0 {
		cpu = liveCPU
	}
	if liveRx >= 0 {
		rx, tx = liveRx, liveTx
	}
	liveMu.Unlock()

	model := readTrim("/tmp/board")
	model = strings.TrimSuffix(model, "-Ax")
	if model == "" {
		model = "DNS-320"
	}
	return map[string]any{
		"name": host, "model": model, "firmware": "Alt-F " + readTrim("/etc/Alt-F"),
		"kernel": readTrim("/proc/sys/kernel/osrelease"),
		"ip":     ip, "mac": mac, "gateway": gw,
		"temp": temp, "fan": fan,
		"uptime": int(up), "load": load, "cpu": cpu,
		"mem":    map[string]any{"total": mt, "used": mu},
		"net":    map[string]any{"rx": rx, "tx": tx},
		"volume": vol,
		"time":   time.Now().Unix(), "version": Version,
	}
}

func isMountpoint(p string) bool {
	b, _ := os.ReadFile("/proc/mounts")
	for _, l := range strings.Split(string(b), "\n") {
		f := strings.Fields(l)
		if len(f) > 1 && f[1] == p {
			return true
		}
	}
	return false
}

// /etc/bay (Alt-F) : left_dev=sda, left_mod=..., left_fam=..., right_dev=...
func bays() map[string]string {
	m := map[string]string{}
	for _, l := range strings.Split(readTrim("/etc/bay"), "\n") {
		k, v, ok := strings.Cut(l, "=")
		if ok {
			m[k] = strings.Trim(v, `"`)
		}
	}
	return m
}

// SMART tourne en tâche de fond : sur un disque mourant, smartctl peut bloquer longtemps,
// et une page ne doit jamais attendre ça.
func smartLoop() {
	for {
		b := bays()
		for _, side := range []string{"left", "right"} {
			if dev := b[side+"_dev"]; dev != "" {
				smartProbe(dev)
			}
		}
		time.Sleep(5 * time.Minute)
	}
}

func smart(dev string) (smartInfo, bool) {
	smartMu.Lock()
	defer smartMu.Unlock()
	c, ok := smartCache[dev]
	return c, ok
}

func smartProbe(dev string) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	// -n standby : ne réveille pas un disque endormi
	out, err := exec.CommandContext(ctx, "/usr/sbin/smartctl", "-n", "standby", "-H", "-A", "/dev/"+dev).CombinedOutput()
	s := string(out)
	info := smartInfo{Health: "unknown", At: time.Now()}
	switch {
	case ctx.Err() != nil:
		info.Health = "error" // ne répond plus
	case strings.Contains(s, "STANDBY") || strings.Contains(s, "SLEEP"):
		info.Health = "sleep"
	case strings.Contains(s, "PASSED"):
		info.Health = "ok"
	case strings.Contains(s, "FAILED"):
		info.Health = "bad"
	}
	_ = err
	for _, l := range strings.Split(s, "\n") {
		f := strings.Fields(l)
		if len(f) >= 10 && f[0] == "194" {
			info.Temp, _ = strconv.Atoi(f[9])
		}
	}
	// erreurs de lecture récentes dans le journal du noyau : le disque lâche, même si SMART dit PASSED
	if info.Health == "ok" || info.Health == "sleep" {
		if k, _ := exec.Command("dmesg").Output(); strings.Contains(string(k), "I/O error, dev "+dev) {
			info.Health = "bad"
		}
	}
	smartMu.Lock()
	if prev, ok := smartCache[dev]; ok && info.Health == "sleep" { // garde la dernière température connue
		info.Temp = prev.Temp
	}
	smartCache[dev] = info
	smartMu.Unlock()
}

func disks() []map[string]any {
	b := bays()
	var list []map[string]any
	for _, side := range []string{"left", "right"} {
		dev := b[side+"_dev"]
		if dev == "" {
			continue
		}
		sectors, _ := strconv.ParseFloat(readTrim("/sys/block/"+dev+"/size"), 64)
		fam := b[side+"_fam"]
		vendor := ""
		if fam != "" {
			vendor = strings.Fields(fam)[0]
		}
		d := map[string]any{
			"bay":    map[string]string{"left": "gauche", "right": "droite"}[side],
			"dev":    dev,
			"vendor": vendor,
			"family": fam,
			"model":  b[side+"_mod"],
			"size":   sectors * 512,
			"label":  b[side+"_cap"],
		}
		if sectors == 0 {
			d["health"] = "error" // le noyau ne lit plus le disque (erreurs d'E/S)
		} else {
			si, ok := smart(dev)
			if !ok {
				d["health"] = "pending"
			} else {
				d["health"] = si.Health
				if si.Temp > 0 && si.Health != "sleep" {
					d["temp"] = si.Temp
				}
			}
		}
		list = append(list, d)
	}
	return list
}
