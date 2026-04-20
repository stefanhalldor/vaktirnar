import { GuardianRole } from './types'

export const previewChat = {
  title: 'Siggi, Jóna & Hófí',
  subtitle: '4 forsjáraðilar · hjá Stebba',
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
    name: 'Anna Sigurðardóttir',
    role: 'Forsjáraðili Jónu (5 ára)',
    verified: true,
    socials: [
      { label: 'Facebook', detail: 'Tengdur síðan 2011 · 340+ vinir', verified: true },
      { label: 'Instagram', detail: '@anna.sigurdar · 180+ fylgjendur', verified: true },
      { label: 'Símanúmer', detail: '+354 ••• ••42', verified: true },
    ],
    child: {
      name: 'Jóna',
      school: 'Árborg',
      allergy: 'Hnetur',
      otherGuardian: 'Helgi (pabbi)',
    },
    shared: 'Jóna og Siggi eru saman í Árborg leikskóla. Þið hafið átt 3 leikvaktir áður.',
    footer: 'Upplýsingar um barnið eru aðeins sýnilegar forsjáraðilum sem Jóna hefur leikvakt með.',
  },
}

export const previewChildren = {
  jona: {
    initial: 'J',
    color: 'amber' as const,
    name: 'Jóna',
    age: '5 ára · Árborg leikskóli',
    allergy: 'Hnetur',
    doctor: 'Heilsugæsla Selfoss',
    emergency: 'Anna',
    team: [
      { name: 'Anna Sigurðardóttir', relation: 'Mamma', role: 'FULL_FORSJA' as GuardianRole, verified: true },
      { name: 'Helgi Jónsson', relation: 'Pabbi', role: 'FULL_FORSJA' as GuardianRole, verified: true },
      { name: 'Guðrún Helgadóttir', relation: 'Amma (í föðurætt)', role: 'UMSJON' as GuardianRole, verified: true },
      { name: 'Hulda Önnudóttir', relation: 'Frænka · systir Önnu', role: 'ADSTOD' as GuardianRole, verified: true },
      { name: 'Magnús Helgason', relation: 'Stóri bróðir · 16 ára', role: 'ADSTOD' as GuardianRole, verified: false },
    ],
    footer: 'Aðeins forsjáraðilar með fulla forsjá geta breytt teyminu.',
  },
}
