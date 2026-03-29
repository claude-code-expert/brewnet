## Database Schema (SQLite)
Key tables: `services`, `deployments`, `domains`, `users`, `acl_rules`, `backups`, `logs`

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| BN001 | 503 | Docker daemon not running |
| BN002 | 409 | Port already in use |
| BN003 | 500 | SSL issuance failed |
| BN004 | 401 | Invalid license key |
| BN005 | 429 | Rate limit exceeded |
| BN006 | 500 | Build failed |
| BN007 | 400 | Invalid Git repository |
| BN008 | 404 | Resource not found |
| BN009 | 500 | Database error |
| BN010 | 403 | Feature requires Pro plan |

## Data Directory

```
~/.brewnet/
├── config.json           # Global configuration
├── docker-compose.yml    # Generated compose file
├── services/             # Service-specific configs
├── storage/              # File storage data
├── backups/              # Backup data
├── logs/                 # Application logs
└── db/                   # SQLite database
```
