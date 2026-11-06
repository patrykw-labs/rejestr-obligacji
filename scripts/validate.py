#!/usr/bin/env python3
"""Sprawdza data/months.json: składnię, schemat i spójność statusów. Uruchom przed każdym commitem."""
import json, re, sys
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "data" / "months.json"
SERIES_KEYS = {"code","term","rate1","rule","margin","capitalization","payout","fee","swapPrice",
               "availability","source","verifiedAt","verify","verifyNote"}
MONTH_KEYS = {"series","nbpRef","cpi","cpiRefMonth","cpiKind","macroVerify","changeNote","status","verifyNote","updatedAt"}
errors, warnings = [], []

data = json.loads(PATH.read_text(encoding="utf-8"))
ids = sorted(data)
for mid in ids:
    m = data[mid]
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", mid):
        errors.append(f"{mid}: zły format id (RRRR-MM)")
    miss = MONTH_KEYS - m.keys()
    if miss: errors.append(f"{mid}: brak pól {sorted(miss)}")
    if m.get("cpiKind") not in ("finalny", "szybki szacunek", None):
        errors.append(f"{mid}: cpiKind={m.get('cpiKind')!r}")
    pending = bool(m.get("macroVerify"))
    for k, s in (m.get("series") or {}).items():
        miss = SERIES_KEYS - s.keys()
        if miss: errors.append(f"{mid}/{k}: brak pól {sorted(miss)}")
        if not str(s.get("code","")).startswith(k):
            errors.append(f"{mid}/{k}: kod {s.get('code')!r} nie zaczyna się od {k}")
        if s.get("verify"): pending = True
        elif not s.get("source") or not s.get("verifiedAt"):
            errors.append(f"{mid}/{k}: verify=false, ale brak source lub verifiedAt")
    st = m.get("status")
    if st == "zweryfikowany" and pending:
        errors.append(f"{mid}: status 'zweryfikowany', a są pozycje verify/macroVerify=true")
    if st != "zweryfikowany" and not pending:
        warnings.append(f"{mid}: wszystko sprawdzone, a status={st!r}")
    if m.get("cpiKind") == "szybki szacunek":
        warnings.append(f"{mid}: CPI to szybki szacunek — zastąp odczytem finalnym, gdy GUS go opublikuje")

# ciągłość miesięcy
def nxt(i):
    y, mo = map(int, i.split("-")); mo += 1
    return f"{y + (mo > 12)}-{(mo - 1) % 12 + 1:02d}"
for a, b in zip(ids, ids[1:]):
    if nxt(a) != b: warnings.append(f"luka w archiwum między {a} a {b}")

for w in warnings: print("UWAGA:", w)
for e in errors: print("BŁĄD:", e)
print(f"{len(ids)} miesięcy ({ids[0]}–{ids[-1]}), błędów: {len(errors)}, uwag: {len(warnings)}")
sys.exit(1 if errors else 0)
