#!/bin/zsh
# UNITYCHECK — compile the Unity client's C# here, without the editor.
# The owner's editor holds the project lock, so `Unity -batchmode` exits
# silently; but the last editor compile leaves the package assemblies
# (glTFast, URP, Newtonsoft, Input System) in Library/ScriptAssemblies,
# and Unity ships its engine and editor modules and a netstandard 2.1
# reference set inside the app bundle. Roslyn from the .NET SDK compiles
# every script under Assets/Bretwalda against those. Exit 0 = no errors.
#   tools/unitycheck.sh            (prints errors, if any, and the DLL size)
set -u
P="${UNITY_PROJECT:-$HOME/bretwalda-blood-moot/BRETWALDA - Blood Moot}"
U="${UNITY_APP:-$(ls -d /Applications/Unity/Hub/Editor/*/Unity.app 2>/dev/null | tail -1)}"
SDK=$(dotnet --list-sdks | tail -1 | sed -E 's/^([^ ]+) \[(.*)\]$/\2\/\1/'); CSC="$SDK/Roslyn/bincore/csc.dll"
[ -f "$CSC" ] || { echo "[unitycheck] no Roslyn in the .NET SDK ($SDK)"; exit 2; }
M="$U/Contents/Resources/Scripting/Managed/UnityEngine"; NSREF=$(find "$U/Contents" -path "*NetStandard/ref*" -name "netstandard.dll" | head -1)
OUT="${TMPDIR:-/tmp}/bretwalda-unitycheck"; mkdir -p "$OUT"; RSP="$OUT/csc.rsp"; : > "$RSP"
echo "-nologo -target:library -out:\"$OUT/Bretwalda.dll\" -nowarn:CS1701,CS1702,CS0168,CS0219,CS8632,CS0649,CS0414 -define:UNITY_EDITOR -define:UNITY_2022_1_OR_NEWER -define:UNITY_6000_0_OR_NEWER" >> "$RSP"
for d in "$M"/*.dll; do echo "-r:\"$d\"" >> "$RSP"; done
echo "-r:\"$NSREF\"" >> "$RSP"; for d in "$(dirname "$NSREF")"/*.dll; do [ "$d" != "$NSREF" ] && echo "-r:\"$d\"" >> "$RSP"; done
for d in "$P/Library/ScriptAssemblies"/*.dll; do case "$d" in *Assembly-CSharp*|*Tests*|*TestFramework*|*DocCodeSamples*) ;; *) echo "-r:\"$d\"" >> "$RSP";; esac; done
find "$P/Assets/Bretwalda" -name "*.cs" | sed 's/.*/"&"/' >> "$RSP"
dotnet "$CSC" @"$RSP" > "$OUT/csc.log" 2>&1; code=$?
grep -E "error CS" "$OUT/csc.log" | sed 's|.*/Assets/|Assets/|' | sort -u | head -40
warns=$(grep -c "warning CS" "$OUT/csc.log"); errs=$(grep -c "error CS" "$OUT/csc.log")
echo "[unitycheck] $(find "$P/Assets/Bretwalda" -name '*.cs' | wc -l | tr -d ' ') scripts, $errs errors, $warns warnings, exit $code$( [ -f "$OUT/Bretwalda.dll" ] && echo ", dll $(stat -f %z "$OUT/Bretwalda.dll") bytes")"
exit $code
