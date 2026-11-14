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
    # cpiYtd: zmiana cen od grudnia poprzedniego roku (GUS „grudzień poprzedniego roku = 100” − 100) za cpiRefMonth;
    # do dokładnej inflacji skumulowanej; przy szybkim szacunku może być null (uzupełnić przy odczycie finalnym)
    y = m.get("cpiYtd")
    if y is not None and not (isinstance(y, (int, float)) and -15 <= y <= 40):
        errors.append(f"{mid}: cpiYtd={y!r} poza zakresem")
    if y is None and m.get("cpiKind") == "finalny":
        warnings.append(f"{mid}: brak cpiYtd (GUS „grudzień poprzedniego roku = 100” za {m.get('cpiRefMonth')})")

# ciągłość miesięcy
def nxt(i):
    y, mo = map(int, i.split("-")); mo += 1
    return f"{y + (mo > 12)}-{(mo - 1) % 12 + 1:02d}"
for a, b in zip(ids, ids[1:]):
    if nxt(a) != b: warnings.append(f"luka w archiwum między {a} a {b}")

# data/przed-2019.json — serie i CPI sprzed archiwum, tylko dla kalkulatora zamiany
PRE = PATH.parent / "przed-2019.json"
if PRE.exists():
    pre = json.loads(PRE.read_text(encoding="utf-8"))
    TERMS = {"EDO": 120, "ROD": 144}
    for ym, v in (pre.get("cpi", {}).get("values") or {}).items():
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", ym) or ym >= ids[0]:
            errors.append(f"przed-2019/cpi: miesiąc {ym!r} poza zakresem (przed {ids[0]})")
        if not isinstance(v, (int, float)): errors.append(f"przed-2019/cpi/{ym}: wartość {v!r}")
    ytd = pre.get("cpi", {}).get("ytd") or {}
    for ym, v in ytd.items():
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", ym) or ym >= ids[0] or not isinstance(v, (int, float)):
            errors.append(f"przed-2019/cpi/ytd/{ym}: {v!r}")
    # łańcuch poziomu cen wymaga grudniów kolejnych lat (od grudnia 2014)
    for yr in range(2015, int(ids[0][:4])):
        if f"{yr}-12" not in ytd and not any(data[k].get("cpiRefMonth") == f"{yr}-12" for k in ids):
            errors.append(f"przed-2019/cpi/ytd: brak grudnia {yr} (łańcuch poziomu cen)")
    for code, s in (pre.get("series") or {}).items():
        t = s.get("type")
        if t not in TERMS or not code.startswith(t) or not re.fullmatch(r"[A-Z]{3}\d{4}", code):
            errors.append(f"przed-2019/{code}: zły kod lub typ {t!r}"); continue
        y, mo = map(int, s.get("purchase", "0-0").split("-")); i = y * 12 + mo - 1 + TERMS[t]
        if f"{i % 12 + 1:02d}{(i // 12) % 100:02d}" != code[3:]:
            errors.append(f"przed-2019/{code}: miesiąc zakupu {s.get('purchase')} nie pasuje do kodu")
        if s.get("purchase", "") >= ids[0]: errors.append(f"przed-2019/{code}: zakup w okresie archiwum miesięcy")
        for k in ("rate1", "margin", "fee"):
            if not isinstance(s.get(k), (int, float)): errors.append(f"przed-2019/{code}: brak {k}")
        if not s.get("source") or not s.get("verifiedAt"): errors.append(f"przed-2019/{code}: brak source lub verifiedAt")

# feed.xml (kanał Atom z ofertami) powinien odpowiadać danym — po zmianie danych: python3 scripts/feed.py
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import feed
    FEEDF = Path(__file__).resolve().parent.parent / "feed.xml"
    if not FEEDF.exists() or FEEDF.read_text(encoding="utf-8") != feed.build():
        # ostrzeżenie, nie błąd: dane są ważniejsze niż kanał; CI sprawdza feed.xml osobnym krokiem (feed.py --check)
        warnings.append("feed.xml nieaktualny — uruchom: python3 scripts/feed.py i dołącz feed.xml do commita")
except Exception as e:  # noqa: BLE001
    warnings.append(f"feed.xml: błąd generowania ({e})")

for w in warnings: print("UWAGA:", w)
for e in errors: print("BŁĄD:", e)
print(f"{len(ids)} miesięcy ({ids[0]}–{ids[-1]}), błędów: {len(errors)}, uwag: {len(warnings)}")
sys.exit(1 if errors else 0)
