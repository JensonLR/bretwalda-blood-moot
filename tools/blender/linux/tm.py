#!/usr/bin/env python3
"""tm.py <label> <cmd> [args...]  - run cmd, print + log wall seconds and peak RSS (largest single descendant).
Appends a TSV row to $TM_LOG (default <repo>/.rebuild-timings.tsv). Exit status = cmd's. Stdlib only."""
import sys, os, time, subprocess, resource
label, cmd = sys.argv[1], sys.argv[2:]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
log = os.environ.get("TM_LOG", os.path.join(root, ".rebuild-timings.tsv"))
t0 = time.time()
rc = subprocess.Popen(cmd).wait()
wall = time.time() - t0
ru = resource.getrusage(resource.RUSAGE_CHILDREN)
line = f"{label}\twall={wall:.1f}s\tuser={ru.ru_utime:.1f}s\tsys={ru.ru_stime:.1f}s\tpeakRSS={ru.ru_maxrss / 1024:.0f}MB\trc={rc}"
sys.stderr.write("TIME " + line.replace("\t", "  ") + "\n")
with open(log, "a") as f:
    f.write(line + "\n")
sys.exit(rc)
