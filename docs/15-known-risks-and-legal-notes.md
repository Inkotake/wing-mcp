# 15. Known Risks and Legal Notes

## 1. Leaked Claude Code source

Do not copy leaked Claude Code source code or internal prompts. Even if code is circulating online, it may have been accidentally published and not licensed for reuse. Use public docs, public SDKs, and open-source agent projects instead.

## 2. Vendor documentation

Do not redistribute vendor PDFs unless license allows. Link to official Behringer / Music Tribe downloads and keep internal notes derived from team usage.

## 3. wapi license

wapi is distributed under its own software licence agreement. Review before bundling binary libraries or distributing a commercial product.

## 4. Live audio liability

The system can affect hearing, speakers, monitors, and show continuity. Build with：

- explicit safety disclaimers。
- visible pending actions。
- emergency stop。
- conservative defaults。
- audit logs。
- operator control。

## 5. Network security

WING control endpoints should not be exposed to the public internet. MCP write tools over HTTP must use authentication, origin/host validation, and preferably VPN/private network access.

## 6. Model error

Models can hallucinate or choose wrong tools. Server-side policy must block dangerous actions regardless of prompt.

## 7. Privacy

Voice transcripts, room recordings, incident logs, and band preferences may be sensitive. Store locally when possible and document data retention.
