import { GuardianRole } from './types'

export const previewChat = {
  title: 'Siggi, Jóna & Hófí',
  subtitle: '4 aðstandendur · hjá Stebba',
  label: 'LEIKVAKT',
  children: [
    { initial: 'S', color: 'amber' as const },
    { initial: 'J', color: 'blue' as const },
    { initial: 'H', color: 'green' as const },
  ],
}

export const previewProfiles = {
  anna: {
    initial: 'A',
    color: 'blue' as const,
    src: 'https://randomuser.me/api/portraits/women/44.jpg',
    name: 'Anna Sigurðardóttir',
    role: 'Mamma Jónu (1983)',
    verified: true,
    socials: [
      { label: 'Facebook', detail: 'Tengd síðan 2011', href: 'https://facebook.com', verified: true },
      { label: 'Instagram', detail: 'Tengd síðan 2014', href: 'https://instagram.com', verified: true },
      { label: 'LinkedIn', detail: 'Tengd síðan 2016', href: 'https://linkedin.com', verified: true },
      { label: 'TikTok', detail: 'Tengd síðan 2022', href: 'https://tiktok.com', verified: true },
      { label: 'Heimasíða', detail: 'www.anna.is', href: 'https://anna.is', verified: false },
    ],
    phone: '+354 772 1234',
    phoneBackup: '+354 552 1234',
    child: {
      name: 'Jóna',
      age: '5 ára',
      school: 'Árborg leikskóli',
      allergy: 'Hnetur',
    },
    shared: 'Jóna og Siggi eru saman í Árborg leikskóla. Þið hafið átt 3 leikvaktir áður.',
    footer: 'Upplýsingar um barnið eru aðeins sýnilegar aðstandendum sem Jóna hefur leikvakt með.',
  },
}

export const previewChildren = {
  jona: {
    initial: 'J',
    color: 'amber' as const,
    name: 'Jóna',
    age: '5 ára · Árborg leikskóli',
    allergy: 'Hnetur',
    emergency: 'Anna',
    team: [
      { name: 'Helgi Jónsson', relation: 'Pabbi', phone: '+354 863 5678', notification: true, verified: true },
      { name: 'Anna Sigurðardóttir', relation: 'Mamma', phone: '+354 772 1234', notification: true, verified: true },
      { name: 'Guðrún Helgadóttir', relation: 'Amma (í föðurætt)', phone: '+354 555 9012', notification: false, verified: true },
      { name: 'Hulda Önnudóttir', relation: 'Frænka', phone: '+354 694 3456', notification: false, verified: true },
      { name: 'Magnús Helgason', relation: 'Stóri bróðir · 16 ára', phone: null, notification: false, verified: false },
    ],
    footer: 'Aðeins aðstandendur með fulla forsjá geta breytt teyminu.',
  },
}
