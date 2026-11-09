import json
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from bridge import ACTUATOR_COMMANDS, STATUS_COMMANDS, bridge


@asynccontextmanager
async def lifespan(_app):
    bridge.start()
    yield
    bridge.stop()


app = FastAPI(title="ESP Voice Dashboard", lifespan=lifespan)
DATA_FILE = Path(__file__).with_name("command_history.json")
pending_commands: deque[str] = deque(maxlen=20)
LIGHT_COMMANDS = {"LIGHT_ON", "LIGHT_OFF"}
ALL_COMMANDS = LIGHT_COMMANDS | ACTUATOR_COMMANDS.keys() | STATUS_COMMANDS.keys()


class CommandLog(BaseModel):
    command: str
    sequence: int


class ControlRequest(BaseModel):
    command: str


def load_history() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def save_history(history: list[dict]) -> None:
    DATA_FILE.write_text(json.dumps(history[-100:], ensure_ascii=False, indent=2), encoding="utf-8")


@app.post("/log")
def log_command(entry: CommandLog) -> dict:
    if entry.command not in ALL_COMMANDS:
        raise HTTPException(status_code=400, detail="Unsupported command")
    result = {"local": True} if entry.command in LIGHT_COMMANDS else bridge.dispatch(entry.command)
    if entry.command in STATUS_COMMANDS:
        result = {"display": bridge.display_status(STATUS_COMMANDS[entry.command]), "state": result}
    if result.get("sent") is False:
        raise HTTPException(status_code=503, detail="MQTT broker unavailable")
    history = load_history()
    history.append({
        "command": entry.command,
        "sequence": entry.sequence,
        "time": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S"),
        "result": result,
    })
    save_history(history)
    return {"ok": True, "result": result}


@app.get("/api/history")
def history() -> list[dict]:
    return list(reversed(load_history()))


@app.post("/api/control")
def control(request: ControlRequest) -> dict:
    if request.command not in ALL_COMMANDS:
        raise HTTPException(status_code=400, detail="Unsupported command")
    if request.command in LIGHT_COMMANDS:
        pending_commands.append(request.command)
        return {"queued": True, "command": request.command}
    result = bridge.dispatch(request.command)
    if request.command in STATUS_COMMANDS:
        result = {"display": bridge.display_status(STATUS_COMMANDS[request.command]), "state": result}
    if result.get("sent") is False:
        raise HTTPException(status_code=503, detail="MQTT broker unavailable")
    return {"command": request.command, "result": result}


@app.get("/api/devices")
def devices() -> dict:
    return bridge.all_states()


@app.get("/api/next-command")
def next_command() -> dict:
    return {"command": pending_commands.popleft() if pending_commands else "NONE"}


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    return """<!doctype html><html><head><meta charset='utf-8'><title>ESP Voice</title>
<style>body{margin:0;background:#07111f;color:#e9f7ff;font:16px system-ui;padding:30px}.card{max-width:720px;margin:auto;border:1px solid #1b4e70;border-radius:18px;padding:24px;background:#0b1a2c}h1{color:#73ddff}.on{color:#64ed9b}.off{color:#ff7d87}button{border:0;border-radius:10px;padding:13px 20px;margin-right:10px;font-weight:700;cursor:pointer}.bon{background:#64ed9b}.boff{background:#ff7d87}li{padding:13px;border-bottom:1px solid #19334d;list-style:none}small{color:#91a9bf}#status{color:#91a9bf}</style>
</head><body><main class='card'><h1>ESP VOICE — CONTROL</h1>
<h2>Local light</h2><button class='bon' onclick="control('LIGHT_ON')">LIGHT ON</button><button class='boff' onclick="control('LIGHT_OFF')">LIGHT OFF</button>
<h2>Smart bin</h2><button onclick="control('BIN_OPEN')">OPEN</button><button onclick="control('BIN_CLOSE')">CLOSE</button><button onclick="control('BIN_AUTO')">AUTO</button>
<p id='status'>Ready.</p><h2>DEVICE STATUS</h2><pre id='devices'>Waiting for telemetry...</pre>
<h2>COMMAND HISTORY</h2><ul id='logs'>Loading...</ul></main>
<script>
async function control(command){
  try { const r=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});
    const data=await r.json(); document.querySelector('#status').textContent=r.ok?JSON.stringify(data):'Could not send: '+JSON.stringify(data);
  } catch(e) { document.querySelector('#status').textContent='Gateway unavailable'; }
}
async function refresh(){
  try { const d=await fetch('/api/history').then(r=>r.json());
    const e=document.querySelector('#logs'); e.replaceChildren();
    for(const item of d){const li=document.createElement('li');li.textContent=item.command+' · '+item.time+' · #'+item.sequence;e.append(li)}
    if(!d.length)e.textContent='No commands yet.';
    const devices=await fetch('/api/devices').then(r=>r.json());
    document.querySelector('#devices').textContent=JSON.stringify(devices,null,2);
  } catch(e) { document.querySelector('#devices').textContent='Gateway unavailable'; }
}
refresh();setInterval(refresh,3000)
</script></body></html>"""
