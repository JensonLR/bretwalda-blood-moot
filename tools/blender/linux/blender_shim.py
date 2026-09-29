#!/usr/bin/env python3
"""blender_shim.py - a headless Blender CLI shim over the `bpy` PyPI module. Use it through the `blender` launcher next to it.

Match the Mac: the owner exports with Blender 5.1.2 (glTF I/O v5.1.20). `setup.sh` installs bpy==5.1.2 (Python 3.13), whose bundled
exporter is that very version, so the rebuilt GLBs carry the same generator string. (bpy 5.0.1 / Python 3.11 also works and writes
byte-equal geometry, but a different generator string.)

Purpose: let tools/blender/*.mjs run on a Linux box with no Blender binary:

    BLENDER=$PWD/tools/blender/linux/blender node tools/blender/exportmen.mjs --cls huscarl

Emulated CLI subset (processed strictly IN ORDER, as Blender does):

    -b / --background            accepted (bpy module is always background)
    -noaudio, -y, -d, --factory-startup, --enable-autoexec, ...   accepted, ignored
    <file>.blend                 bpy.ops.wm.open_mainfile(filepath=...)   (position matters)
    -P / --python <file.py>      exec the file with __name__=="__main__", __file__ set
    --python-expr <code>         exec a code string
    --python-exit-code <n>       exit status when a script raises (see below)
    --version / -v               print a Blender-style version banner, exit 0
    --                           everything after is left in sys.argv for the scripts

sys.argv is set to the FULL original command line, exactly as Blender does
(['blender', '-b', 'x.blend', '-P', 'script.py', '--', 'huscarl']), because the
scripts do  sys.argv[sys.argv.index("--") + 1:].

DELIBERATE DIFFERENCES FROM REAL BLENDER (each one is a choice, not an accident):

 1. EXIT CODE ON A RAISING SCRIPT. Real Blender prints the traceback and exits 0
    unless --python-exit-code is given. That is how a rebuild "succeeds" while
    writing nothing. This shim exits 1 instead. Set BLENDER_SHIM_LENIENT=1 to
    reproduce real Blender's exit 0.
 2. HOME IS REDIRECTED per invocation, as a backstop. The tools/blender/*.py scripts used to hardcode
    os.path.expanduser("~/bretwalda-blood-moot"); they now derive the repo root from their own __file__, so nothing in the repo needs
    this any more, but a third-party or older script that still expands "~" would silently read another checkout. The shim infers the
    repo root (env BW_ROOT, else the -P script's <root>/tools/blender/, else a walk up from cwd), builds
    <cache>/bretwalda-blender-shim/home/<hash>/bretwalda-blood-moot -> <root> and points $HOME there, so every worktree maps to ITSELF
    and nothing under /root has to be symlinked. Set BLENDER_SHIM_KEEP_HOME=1 to keep the real HOME.
 3. Exporter add-on version. bpy 5.1.2 bundles io_scene_gltf2 5.1.20 = what the Mac wrote. (bpy 5.0.1 bundles 5.0.21: same geometry,
    different asset.generator string; docs/BPY-PIPELINE.md.)
 4. mathutils.noise is SEEDED (default 7 = strands.py's own default SEED), as a backstop. Its stock seed is the WALL CLOCK; strands.py
    now calls noise.seed_set(SEED) itself (that call wins, it runs after the shim's), so the 28 hair/beard strand GLBs are reproducible
    on real Blender too. The shim's seed only matters for a script that does not seed. BLENDER_SHIM_NOISE_SEED=0 restores the
    wall-clock behaviour.
 5. --python-expr shares one globals dict with -P scripts (Blender's __main__ does too).
"""
import sys, os, hashlib, runpy, traceback

SHIM_HOME_BASE = os.environ.get("BLENDER_SHIM_HOME") or os.path.join(os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"), "bretwalda-blender-shim", "home")


def find_root(argv):
    env = os.environ.get("BW_ROOT")
    if env and os.path.isdir(os.path.join(env, "tools", "blender")):
        return os.path.realpath(env)
    # from a -P script path
    for i, a in enumerate(argv):
        if a in ("-P", "--python") and i + 1 < len(argv):
            p = os.path.realpath(argv[i + 1])
            r = os.path.dirname(os.path.dirname(os.path.dirname(p)))
            if os.path.isdir(os.path.join(r, "tools", "blender")):
                return r
    d = os.getcwd()
    while True:
        if os.path.isdir(os.path.join(d, "tools", "blender")) and os.path.exists(os.path.join(d, "package.json")):
            return d
        nd = os.path.dirname(d)
        if nd == d:
            return None
        d = nd


def redirect_home(root):
    if not root or os.environ.get("BLENDER_SHIM_KEEP_HOME"):
        return
    h = os.path.join(SHIM_HOME_BASE, hashlib.sha1(root.encode()).hexdigest()[:10])
    os.makedirs(h, exist_ok=True)
    link = os.path.join(h, "bretwalda-blood-moot")
    try:
        if os.path.islink(link) and os.readlink(link) != root:
            os.unlink(link)
        if not os.path.lexists(link):
            os.symlink(root, link)
    except FileExistsError:
        pass
    os.environ["HOME"] = h
    # keep bpy's own config/cache under the fake home too (clean, reproducible prefs)
    os.environ.setdefault("XDG_CONFIG_HOME", os.path.join(h, ".config"))
    os.environ.setdefault("XDG_CACHE_HOME", os.path.join(h, ".cache"))


def main():
    argv = sys.argv[1:]
    if any(a in ("--version", "-v") for a in argv[: (argv.index("--") if "--" in argv else len(argv))]):
        import bpy; print(f"Blender {bpy.app.version_string}\n\tbuild date: shim (bpy PyPI module)\n\tbuild hash: bpy")
        return 0
    redirect_home(find_root(argv))

    import bpy  # noqa: E402  (after HOME is redirected)
    # 4. DETERMINISTIC mathutils.noise. Its default seed is 0 = "seed from the wall clock". strands.py seeds it
    #    itself now (noise.seed_set(SEED), which overrides this); this default covers any script that does not.
    #    BLENDER_SHIM_NOISE_SEED=0 restores the wall-clock behaviour.
    try:
        from mathutils import noise as _shim_noise
        _shim_noise.seed_set(int(os.environ.get("BLENDER_SHIM_NOISE_SEED", "7")))
    except Exception as _e:  # pragma: no cover
        sys.stderr.write(f"blender-shim: could not seed mathutils.noise: {_e}\n")

    # Blender's sys.argv is the full command line
    sys.argv = [sys.argv[0]] + argv
    exit_code = int(os.environ.get("BLENDER_SHIM_EXIT_CODE", "0"))
    lenient = bool(os.environ.get("BLENDER_SHIM_LENIENT"))
    G = {"__name__": "__main__", "__builtins__": __builtins__}
    actions = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--":
            break
        if a in ("-P", "--python"):
            actions.append(("py", argv[i + 1])); i += 2; continue
        if a == "--python-expr":
            actions.append(("expr", argv[i + 1])); i += 2; continue
        if a == "--python-exit-code":
            exit_code = int(argv[i + 1]); i += 2; continue
        if a in ("--python-console",):
            i += 1; continue
        if a in ("-b", "--background", "-noaudio", "-y", "--enable-autoexec", "-Y", "--disable-autoexec",
                 "--factory-startup", "-d", "--debug", "-con", "--no-window-focus"):
            i += 1; continue
        if a in ("-t", "--threads", "-o", "--render-output", "-s", "-e", "-f", "-a", "-F", "-E", "-S", "-x", "-j", "-noglsl", "--log", "--log-file", "-w"):
            # value-taking or render flags we do not emulate: refuse loudly rather than silently ignore
            sys.stderr.write(f"blender-shim: unsupported flag {a}\n"); return 2
        if a.lower().endswith(".blend") or (not a.startswith("-") and os.path.isfile(a) and a.lower().endswith(".blend")):
            actions.append(("blend", a)); i += 1; continue
        if a.startswith("-"):
            sys.stderr.write(f"blender-shim: ignoring unknown flag {a}\n"); i += 1; continue
        sys.stderr.write(f"blender-shim: ignoring positional {a}\n"); i += 1

    rc = 0
    for kind, val in actions:
        try:
            if kind == "blend":
                if not os.path.exists(val):
                    sys.stderr.write(f"Error: Cannot read file \"{val}\": No such file or directory\n")
                    continue   # real Blender also carries on
                bpy.ops.wm.open_mainfile(filepath=os.path.abspath(val))
                print(f"Read blend: \"{os.path.abspath(val)}\"")
            elif kind == "py":
                path = os.path.abspath(val)
                src = open(path, "r", encoding="utf-8").read()
                G["__file__"] = path
                exec(compile(src, path, "exec"), G)
            elif kind == "expr":
                exec(compile(val, "<string>", "exec"), G)
        except SystemExit as e:
            sys.stdout.flush(); sys.stderr.flush()
            code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            return code
        except BaseException:
            traceback.print_exc()
            sys.stderr.write(f"\nError: Python script failed, check the message in the system console\n")
            rc = exit_code if (exit_code or lenient) else 1
            if not lenient and exit_code == 0:
                rc = 1
            break
    sys.stdout.flush(); sys.stderr.flush()
    return rc


if __name__ == "__main__":
    code = main()
    try:
        sys.stdout.flush(); sys.stderr.flush()
    except Exception:
        pass
    sys.exit(code)
