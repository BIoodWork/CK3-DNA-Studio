from __future__ import annotations

import json
from pathlib import Path
import sys
import time


PROJECT_ROOT = Path(__file__).resolve().parent
SRC_ROOT = PROJECT_ROOT / "src"

if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

def dispatch(payload: dict) -> dict:
    deadline = payload.get("deadline")
    if deadline is not None and (type(deadline) not in (int, float) or time.time() * 1000 >= deadline):
        raise ValueError("Die Anfrage ist abgelaufen. Bitte erneut versuchen; es wurde keine neue Aktion gestartet.")
    action = payload.get("action", "convert")
    if action in {"studio_detect", "studio_catalog", "studio_encode", "studio_palette"}:
        from ck3_dna_converter_core.core.services.studio import studio_detect, studio_catalog, studio_encode, studio_palette
        if action == "studio_detect":
            return studio_detect(payload.get("text", ""), payload.get("profile"))
        if action == "studio_catalog":
            return studio_catalog(payload.get("profile"))
        if action == "studio_palette":
            return studio_palette(payload.get("profile"), payload.get("gene"))
        return studio_encode(payload.get("text", ""), payload.get("profile"), payload.get("genes", []), payload.get("targetFormat"))
    if sys.platform != "win32" and action in {"game_status", "game_copy", "game_paste", "library_check", "library_apply"}:
        return {"ready": False, "compatible": False, "platformUnsupported": True, "message": "CK3 Gateway is available on Windows only. On macOS, copy DNA from the DNA Code tab into CK3 Ruler Designer."}
    if action in {"library_check", "library_apply"}:
        from library_compat import handle_library
        return handle_library(action, payload)
    if action in {"game_status", "game_copy", "game_paste"}:
        from live_game import handle_live
        return handle_live(action, payload)
    if action == "schemas":
        from ck3_dna_converter_core.core.services.runtime_conversion import list_current_schemas
        return list_current_schemas()
    if action == "convert":
        from ck3_dna_converter_core.core.services.runtime_conversion import analyze_current
        return analyze_current(
            payload.get("text", ""),
            source_mode=payload.get("sourceMode", payload.get("mode", "none")),
            target_mode=payload.get("targetMode", payload.get("mode", "none")),
            target_format=payload.get("targetFormat", "encoded"),
            allow_lossy=bool(payload.get("allowLossyEncodedFallbacks", False)),
        )
    raise ValueError("Unbekannte Aktion.")


def process_request(raw: str) -> dict:
    request_id = None
    try:
        if len(raw) > 2_000_000:
            raise ValueError("DNA-Eingabe ist zu gross.")
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise ValueError("Ungueltige Anfrage.")
        request_id = request.get("requestId")
        payload = request.get("payload", request)
        if not isinstance(payload, dict):
            raise ValueError("Ungueltige Anfrage.")
        return {"requestId": request_id, "ok": True, "analysis": dispatch(payload)}
    except Exception as exc:
        return {"requestId": request_id, "ok": False, "error": str(exc)}


def main() -> int:
    # The Electron bridge always uses UTF-8, regardless of the Windows code page.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    if "--server" in sys.argv:
        for raw in sys.stdin:
            if raw.strip():
                print(json.dumps(process_request(raw), ensure_ascii=True), flush=True)
        return 0
    response = process_request(sys.stdin.read())
    print(json.dumps(response, ensure_ascii=True), flush=True)
    return 0 if response["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
