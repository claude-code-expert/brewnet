// English translations for Brewnet admin-ui.
// Korean text stays inline as fallback in each t() call.
// Only Korean → English mappings are needed here.

const en: Record<string, string> = {
  // ConfirmModal
  'confirm.danger_title': 'Dangerous operation',
  'confirm.default_title': 'Confirm',
  'confirm.type_prefix': 'Type',
  'confirm.type_suffix': 'to confirm',

  // ProgressModal (toast)
  'progress.deploy_success': 'Deploy completed successfully.',
  'progress.app_created': 'App created successfully.',

  // Apps.tsx (delete confirmation)
  'apps.delete_message': 'All data related to "{name}" will be permanently deleted. This action cannot be undone.',
  'apps.delete_label': 'Permanently Delete',

  // CreateAppModal (port check)
  'create.port_checking': 'Checking port...',
  'create.port_conflict': 'Port {port} is in use.',
  'create.port_suggest': 'Use {port}',

  // PasswordGate
  'gate.wrong_password': 'Invalid password.',
  'gate.server_unreachable': 'Cannot connect to server.',
  'gate.verify_button': 'Verify',
  'gate.verifying': 'Verifying...',

  // OverviewTab
  'overview.deploy_hint': 'Run Deploy first to initialize the Gitea repository and activate the access URL.',

  // DeploymentTab
  'deployment.gitea_hint': 'Use the admin account set during Brewnet installation to log in to Gitea. This repository is created automatically when you create an app, and code is pushed.',

  // CloudflareTunnelModal
  'cf.help_hint': 'Click the ? button for help on each field.',
  'cf.container_restarted': 'cloudflared container restarted automatically',
  'cf.compose_restart_failed': 'docker-compose.yml was updated but cloudflared failed to restart.',
  'cf.manual_run': 'Manually run',
  'cf.run_suffix': '.',
  'cf.compose_update_failed': 'Could not automatically update docker-compose.yml.',
  'cf.manual_update': 'Manually update the {command} and {token} environment variables for the cloudflared service and restart.',

  // TunnelStep
  'tunnel.compose_restart_done': 'docker-compose.yml updated and cloudflared container restarted',
  'tunnel.compose_restart_failed': 'docker-compose.yml was updated but cloudflared failed to restart.',
  'tunnel.manual_run_suffix': '.',
  'tunnel.compose_update_failed': 'Could not automatically update docker-compose.yml.',
  'tunnel.manual_update': 'Manually update the {command} and {token} for the cloudflared service and restart.',
  'tunnel.name_desc': 'Name of the tunnel to create on Cloudflare. This tunnel is a shared connection channel for all apps.',
  'tunnel.step12_invalid_title': 'Step 1/2 information is invalid',
  'tunnel.step12_invalid_desc': 'API token or Zone information was not saved. Please start over from Step 1.',
  'tunnel.step12_restart': 'Restart from Step 1',

  // TokenStep
  'token.admin_pw_desc': 'Enter the admin password set during Brewnet installation.',

  // AppDomainTab
  'appdomain.step1_desc': 'Issue and verify Cloudflare API Token',
  'appdomain.step2_desc': 'Select domain (Zone) to use',
  'appdomain.step3_desc': 'Create Cloudflare Tunnel',
  'appdomain.no_config_desc': 'To expose your app to a public domain without a public IP or port forwarding, Cloudflare Tunnel setup is required. Setup is needed only once; after that, just connect a subdomain per app.',
  'appdomain.setup_guide': 'View setup guide',
  'appdomain.connected_banner': 'DNS propagation complete. Domain is set up. Click to visit the connected domain.',
  'appdomain.cname_auto_info': 'Cloudflare DNS CNAME record and Tunnel ingress rule will be created automatically.',
  'appdomain.apex_both_and': ' and ',
  'appdomain.apex_both_suffix': ' will both be connected.',
  'appdomain.apex_warning': 'All traffic for this domain will be routed to this app.',

  // ExternalDomainsSection (DNS provider Korean steps)
  'dns.gabia_step1': 'Log in to Gabia → My Page → Domain Management',
  'dns.gabia_step2': 'Click "DNS Settings" for the target domain',
  'dns.gabia_step3': 'Click "Add Record"',
  'dns.gabia_step4': 'Type: CNAME, Host: {subdomain}, Value: {target}',
  'dns.gabia_step5': 'TTL: 3600 (or default)',
  'dns.gabia_step6': 'Click "Confirm" to save',
  'dns.cafe24_step1': 'Log in to Cafe24 → My Service Management',
  'dns.cafe24_step2': 'Domain Management → DNS Management',
  'dns.cafe24_step3': 'Click "Add DNS Record"',
  'dns.cafe24_step4': 'Type: CNAME, Host: {subdomain}, Value: {target}',
  'dns.cafe24_step5': 'Save',
  'dns.cafe24_step6': 'Wait for DNS propagation (5-30 min)',

  // useLogStream
  'logs.stream_disconnected': 'Log stream disconnected. Close the modal and reopen.',
  'logs.stream_failed': 'Log stream connection failed',
};

export default en;
