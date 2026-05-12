use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    eprintln!("wing-native-sidecar starting");

    for line in stdin.lock().lines() {
        let line = line.unwrap_or_default();
        if line.trim().is_empty() {
            continue;
        }
        eprintln!("wing-native-sidecar received: {}", line);
        let response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": null,
            "result": { "ok": true, "stub": true }
        });
        writeln!(stdout, "{}", response).unwrap();
        stdout.flush().unwrap();
    }
}
