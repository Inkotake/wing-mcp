use std::io::{self, BufRead, Write};

fn main() {
    // Stub JSON-RPC loop. Replace with libwing-backed implementation.
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line.unwrap_or_default();
        if line.trim().is_empty() {
            continue;
        }
        eprintln!("wing-native-sidecar received: {}", line);
        let response = r#"{"jsonrpc":"2.0","id":null,"result":{"ok":true,"stub":true}}"#;
        writeln!(stdout, "{}", response).unwrap();
        stdout.flush().unwrap();
    }
}
