# CLI

```bash
brewnet init                   # Interactive setup wizard (7-step flow)
brewnet add <service>          # Add a service (e.g., jellyfin, nextcloud)
brewnet remove <service>       # Remove a service
brewnet up                     # Start all services (docker-compose up)
brewnet down                   # Stop all services
brewnet status                 # Show service status
brewnet logs [service]         # View logs
brewnet update                 # Update services
brewnet backup                 # Create backup
brewnet restore <backup-id>    # Restore from backup
brewnet export                 # Export configuration
brewnet deploy <path>          # Deploy an application
brewnet domain add <domain>    # Add custom domain
brewnet domain ssl <domain>    # Configure SSL
brewnet domain tunnel setup    # Configure Cloudflare Tunnel
brewnet domain tunnel status   # Check tunnel status
brewnet domain tunnel expose   # Add public hostname
brewnet storage init           # Initialize file storage
brewnet create-app <name>      # Scaffold a new app project
```
