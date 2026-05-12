//! wing-native-sidecar — JSON-RPC bridge to WING Native Protocol
//!
//! Communicates via stdin/stdout JSON-RPC with the TypeScript MCP server.
//! Handles WING device discovery (UDP 2222) and parameter read/write (stub).
//!
//! Usage: wing-native-sidecar
//! Input:  {"jsonrpc":"2.0","id":1,"method":"discover","params":{"timeout_ms":1500}}
//! Output: {"jsonrpc":"2.0","id":1,"result":{"devices":[...]}}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::net::UdpSocket;
use std::time::Duration;

#[derive(Deserialize)]
struct Request {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Serialize)]
struct Response {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ResponseError>,
}

#[derive(Serialize)]
struct ResponseError {
    code: i32,
    message: String,
}

fn send_response(id: Option<Value>, result: Option<Value>, error: Option<ResponseError>) {
    let resp = Response {
        jsonrpc: "2.0".to_string(),
        id,
        result,
        error,
    };
    let mut stdout = io::stdout();
    let _ = writeln!(stdout, "{}", serde_json::to_string(&resp).unwrap_or_default());
    let _ = stdout.flush();
}

fn discover_devices(timeout_ms: u64) -> Vec<Value> {
    let mut devices = Vec::new();
    let sock = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[sidecar] Failed to bind UDP socket: {}", e);
            return devices;
        }
    };
    let _ = sock.set_broadcast(true);
    let _ = sock.set_read_timeout(Some(Duration::from_millis(timeout_ms)));

    // Send WING? broadcast
    if let Err(e) = sock.send_to(b"WING?", "255.255.255.255:2222") {
        eprintln!("[sidecar] Broadcast send failed: {}", e);
        return devices;
    }
    eprintln!("[sidecar] Sent WING? broadcast, waiting {}ms...", timeout_ms);

    let mut buf = [0u8; 1024];
    loop {
        match sock.recv_from(&mut buf) {
            Ok((len, addr)) => {
                let msg = String::from_utf8_lossy(&buf[..len]);
                eprintln!("[sidecar] Received: {} from {}", msg.trim(), addr);
                if msg.starts_with("WING,") {
                    let parts: Vec<&str> = msg.trim().split(',').collect();
                    if parts.len() >= 4 {
                        devices.push(serde_json::json!({
                            "id": format!("wing-{:?}", parts.get(4).unwrap_or(&"unknown")),
                            "ip": parts.get(1).unwrap_or(&"unknown"),
                            "name": parts.get(2).unwrap_or(&"WING"),
                            "model": parts.get(3).unwrap_or(&"WING"),
                            "serial": parts.get(4).unwrap_or(&""),
                            "firmware": parts.get(5).unwrap_or(&""),
                        }));
                    }
                }
            }
            Err(_) => break, // timeout
        }
    }

    eprintln!("[sidecar] Discovery complete: {} devices found", devices.len());
    devices
}

fn main() {
    eprintln!("[sidecar] wing-native-sidecar starting");

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }

        let req: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[sidecar] Parse error: {}", e);
                send_response(None, None, Some(ResponseError { code: -32700, message: format!("Parse error: {}", e) }));
                continue;
            }
        };

        eprintln!("[sidecar] Received method: {}", req.method);

        match req.method.as_str() {
            "discover" => {
                let timeout = req.params
                    .as_ref()
                    .and_then(|p| p.get("timeout_ms"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1500);
                let devices = discover_devices(timeout);
                send_response(req.id, Some(serde_json::json!({ "devices": devices })), None);
            }
            "get_param" => {
                // Stub: return placeholder until Native protocol is implemented
                let path = req.params
                    .as_ref()
                    .and_then(|p| p.get("path"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("/unknown");
                send_response(req.id, Some(serde_json::json!({
                    "ok": true,
                    "stub": true,
                    "path": path,
                    "value": { "type": "float", "value": 0.0, "unit": "dB" }
                })), None);
            }
            "set_param" => {
                // Stub: echo back
                eprintln!("[sidecar] set_param is a stub — no hardware write performed");
                send_response(req.id, Some(serde_json::json!({
                    "ok": true,
                    "stub": true,
                    "warning": "Native protocol not yet implemented. No hardware write performed."
                })), None);
            }
            "status" | "ping" => {
                send_response(req.id, Some(serde_json::json!({
                    "ok": true,
                    "sidecar": "wing-native-sidecar",
                    "version": "0.1.0",
                    "driver": "native"
                })), None);
            }
            _ => {
                send_response(req.id, None, Some(ResponseError {
                    code: -32601,
                    message: format!("Method not found: {}", req.method),
                }));
            }
        }
    }

    eprintln!("[sidecar] Shutting down");
}
