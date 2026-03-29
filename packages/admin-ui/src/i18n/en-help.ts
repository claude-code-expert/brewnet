// English translations for HelpDrawer structured content.
// Must match the HelpItem interface in HelpDrawer.tsx.

interface HelpItem {
  title: string;
  what: string;
  howToGet: Array<{ step: string; detail?: string }>;
  note?: string;
  link: string;
  linkLabel: string;
}

export const HELP_CONTENT_EN: Record<string, HelpItem> = {
  'api-token': {
    title: 'Cloudflare API Token',
    what:
      'An API Token is an authentication key that allows Brewnet to automatically manage tunnel creation and DNS records via the Cloudflare API. ' +
      'Unlike the Global API Key which has full account access, this token is scoped to specific operations only.',
    howToGet: [
      { step: 'Click profile icon (top right) → "My Profile" → "API Tokens" in left menu' },
      { step: 'Click "Create Token" → scroll to "Custom token" row → click "Get started"' },
      { step: 'Enter Token Name (e.g., brewnet)' },
      {
        step: 'Permissions — Permission 1: Tunnel management',
        detail:
          '① First dropdown → Account\n' +
          '② Second dropdown → Cloudflare Tunnel\n' +
          '③ Third dropdown → Edit',
      },
      {
        step: 'Click "+ Add more" → Permission 2: DNS record management',
        detail:
          '① First dropdown → Zone\n' +
          '② Second dropdown → DNS\n' +
          '③ Third dropdown → Edit',
      },
      {
        step: 'Click "+ Add more" → Permission 3: Domain list access',
        detail:
          '① First dropdown → Zone\n' +
          '② Second dropdown → Zone (yes, both are "Zone")\n' +
          '③ Third dropdown → Read',
      },
      {
        step: 'Zone Resources — specify which domains this token applies to',
        detail:
          '"Include" → "All zones from an account" → select your account\n\n' +
          'To allow only specific domains:\n' +
          '"Include" → "Specific zone" → select the domain to use',
      },
      { step: 'Click "Continue to summary" → "Create Token" → copy the displayed token immediately' },
    ],
    note: 'The token is displayed only once right after creation. If you close the window, you cannot view it again. Make sure to copy and store it securely.',
    link: 'https://dash.cloudflare.com/profile/api-tokens',
    linkLabel: 'Open Cloudflare API Tokens page →',
  },

  'zone': {
    title: 'Domain (Zone)',
    what:
      'A Cloudflare Zone represents a domain (e.g., example.com) managed by Cloudflare. ' +
      'If your API Token is valid, all domains registered to your account will be automatically loaded.',
    howToGet: [
      {
        step: "If you don't have a domain",
        detail: 'Purchase directly from Cloudflare Registrar, or buy from another registrar (GoDaddy, AWS, etc.) and transfer the nameservers to Cloudflare.',
      },
      {
        step: 'If you already have a domain on Cloudflare',
        detail: 'Click "Load Domains" and it will automatically appear in the selection list.',
      },
      {
        step: 'Domain status (Active/Pending)',
        detail: 'Pending means the nameserver change is still propagating. DNS record creation requires the domain to be Active.',
      },
    ],
    link: 'https://dash.cloudflare.com/',
    linkLabel: 'Check domains in Cloudflare Dashboard →',
  },

  'subdomain': {
    title: 'Subdomain',
    what:
      'A subdomain is a prefix added before your domain. For example, if your app is named "my-blog", ' +
      'it becomes accessible at my-blog.example.com. A CNAME DNS record is automatically created in Cloudflare ' +
      'for each subdomain, along with a Tunnel ingress rule.',
    howToGet: [
      {
        step: 'Auto-filled based on the app name',
        detail: 'Example: if the app name is "nodejs-express", "nodejs-express" is automatically suggested.',
      },
      {
        step: 'Rules: lowercase letters, numbers, and hyphens (-) only',
        detail: 'Uppercase, underscores (_), and spaces are not allowed. Cannot start or end with a hyphen.',
      },
      {
        step: 'Duplicate check',
        detail: 'An error occurs if the same subdomain is already connected to another app on the same domain.',
      },
    ],
    note: 'DNS propagation may take up to a few minutes after connection. Cloudflare usually reflects changes immediately.',
    link: 'https://dash.cloudflare.com/',
    linkLabel: 'Check Cloudflare DNS records →',
  },

  'cloudflare-setup': {
    title: 'Cloudflare Tunnel Setup Guide',
    what:
      'Cloudflare Tunnel lets you securely expose your home server apps to external domains (e.g., myapp.example.com) ' +
      'without a public IP or port forwarding. Setup is needed only once; after that, just connect a subdomain per app.',
    howToGet: [
      {
        step: 'Step 1 — Issue and verify API Token',
        detail:
          'My Profile → API Tokens → Create Token → Custom token → Get started\n\n' +
          'Add 3 permissions (each row: Category → Service → Level):\n' +
          '  Account  →  Cloudflare Tunnel  →  Edit\n' +
          '  Zone     →  DNS                →  Edit\n' +
          '  Zone     →  Zone               →  Read\n\n' +
          'Zone Resources:\n' +
          '  Include → All zones from an account → select your account',
      },
      {
        step: 'Step 2 — Select Zone (domain)',
        detail: 'Once the API Token is verified, domains registered to your account are loaded automatically. Select the domain to use.',
      },
      {
        step: 'Step 3 — Create Tunnel',
        detail: 'Enter a name and click "Create Tunnel". The tunnel will be automatically created on Cloudflare.',
      },
      {
        step: 'Step 4 — Connect subdomain per app',
        detail: 'After setup, go to each app\'s Domain tab, enter a subdomain, and click Connect. The DNS record is created automatically.',
      },
    ],
    note: 'If you don\'t have a Cloudflare account and domain, you need to sign up and transfer your domain to Cloudflare first.',
    link: 'https://dash.cloudflare.com/',
    linkLabel: 'Open Cloudflare Dashboard →',
  },

  'tunnel-name': {
    title: 'Tunnel Name',
    what:
      'Cloudflare Tunnel is a technology that securely exposes your local server to the internet without a public IP or port forwarding. ' +
      'The tunnel name is used as a label to identify this connection in the Cloudflare Zero Trust dashboard.',
    howToGet: [
      { step: 'The name is auto-filled based on the project name. Use it as-is or change it to your preferred name.' },
      {
        step: 'Naming rules',
        detail: 'Only lowercase letters, numbers, and hyphens (-). Must be unique within your Cloudflare account.',
      },
      {
        step: 'Where to verify after creation',
        detail: 'Cloudflare Zero Trust Dashboard → Networks → Tunnels. You can check the created tunnel and its status.',
      },
    ],
    note: 'An error occurs if a tunnel with the same name already exists. Delete the existing tunnel or use a different name.',
    link: 'https://one.dash.cloudflare.com/',
    linkLabel: 'Check tunnels in Cloudflare Zero Trust →',
  },
};
