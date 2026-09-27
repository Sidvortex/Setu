/**
 * Project team — single source of truth for the About modal and the
 * Contact page. Edit here, both update.
 */
export interface TeamMember {
  name: string;
  role: 'Project Lead' | 'Member';
  focus: string;
  email: string;
  github?: string;
  linkedin?: string;
  portfolio?: string;
}

export const TEAM: TeamMember[] = [
  {
    name: 'Ravada Siddharth',
    role: 'Project Lead',
    focus: 'ML models, backend, GIS/maps, auth, deployment, AI assistant',
    email: 'ravadasiddharth@gmail.com',
    github: 'https://github.com/Sidvortex',
    linkedin: 'https://www.linkedin.com/in/siddharth-ravada-a032b52a2/',
    portfolio: 'https://portfolio-omega-gold-60.vercel.app/',
  },
  {
    name: 'Mala Kumari',
    role: 'Member',
    focus: 'Environmental data, backend & database, authentication',
    email: 'malakumari9311@gmail.com',
    github: 'https://github.com/mala9311',
    linkedin: 'https://www.linkedin.com/in/mala-kumari-930aa9295/',
  },
  {
    name: 'Vinayak Kapoor',
    role: 'Member',
    focus: 'Documentation, testing',
    email: 'vinayakkapoor6605@gmail.com',
    github: 'https://github.com/vinayak605',
    linkedin: 'https://www.linkedin.com/in/vinayak-kapoor-0a47b2380',
  },
  {
    name: 'Ayush Mishra',
    role: 'Member',
    focus: 'Deployment, documentation, testing',
    email: 'am8172689@gmail.com',
    github: 'https://github.com/ayush77-pro',
    linkedin: 'https://www.linkedin.com/in/ayush-mishra-53bb99311',
    portfolio: 'https://ayush77-pro.github.io/portfolio',
  },
  {
    name: 'Arpit Kumar',
    role: 'Member',
    focus: 'Prediction & analytics, model implementation, citizen platform',
    email: 'arpitkumar1275arpitgupta@gmail.com',
    github: 'https://github.com/arpitkumar1275hacker',
    linkedin: 'https://www.linkedin.com/in/arpit-kumar1',
  },
  {
    name: 'Vidit Sharma',
    role: 'Member',
    focus: 'Citizen platform, prediction, authentication',
    email: 'viditsharma041206@gmail.com',
    github: 'https://github.com/viditsharma041206-cell',
    linkedin: 'https://www.linkedin.com/in/vidit-sharma-a58471324',
  },
];
