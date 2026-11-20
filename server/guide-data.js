/* ───────────────────────────────────────────────────────────────
   ROUTE & STOP DATA – Alluri Sitharama Raju District (ASR)
   Each route has:
     id        – unique route code
     name      – route / mandal name
     stops     – ordered list of boarding points (first = origin, last = terminus)
     connectivity – major outbound destinations served
     base      – base fare ₹
     frequency – timetable status text
   ─────────────────────────────────────────────────────────────── */

export const routes = [
  {
    id: 'ASR-01',
    name: 'Paderu Mandal',
    stops: [
      'Paderu RTC Complex',
      'Paderu Junction',
      'Modamamba Junction',
      'Gonduru',
      'Minumuluru',
      'Vantlamamidi',
      'Visakhapatnam',
      'Anakapalli',
      'Araku',
      'Chintapalli',
    ],
    connectivity: 'Visakhapatnam, Anakapalli, Araku, Chintapalli',
    base: 15,
    frequency: 'Paderu departures listed on Bus Timings page',
  },
  {
    id: 'ASR-02',
    name: 'Araku Valley',
    stops: [
      'Araku RTC Complex',
      'Araku Junction',
      'Padmapuram',
      'Chompi',
      'Sunkarametta',
      'Madagada',
      'Visakhapatnam',
      'Rajahmundry',
      'Vizianagaram',
    ],
    connectivity: 'Visakhapatnam, Rajahmundry, Vizianagaram',
    base: 18,
    frequency: 'Frequent services; exact times not provided',
  },
  {
    id: 'ASR-03',
    name: 'Ananthagiri',
    stops: [
      'Ananthagiri Bus Stop',
      'Kasipatnam',
      'Borra Junction (Borra Caves)',
      'Damuku',
      'Tyda',
      'Chilakalagadda',
      'Visakhapatnam (via S. Kota)',
      'Araku',
    ],
    connectivity: 'Visakhapatnam (via S. Kota), Araku',
    base: 20,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-04',
    name: 'Dumbriguda',
    stops: [
      'Dumbriguda Bus Stop',
      'Killoguda',
      'Araku-Dumbriguda Road Junction',
      'Araku',
      'Paderu',
      'Koraput (Odisha border)',
    ],
    connectivity: 'Araku, Paderu, Koraput (Odisha border)',
    base: 16,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-05',
    name: 'Hukumpeta',
    stops: [
      'Hukumpeta Bus Stop',
      'Sukuru',
      'Kontili',
      'Bakuru Road Junction',
      'Paderu',
      'Araku',
      'Dumbriguda',
    ],
    connectivity: 'Paderu, Araku, Dumbriguda',
    base: 14,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-06',
    name: 'Pedabayalu',
    stops: [
      'Pedabayalu Bus Stop',
      'Gomangi',
      'Rudakota',
      'Kinchavanipalem',
      'Paderu',
      'Munchingput',
      'Visakhapatnam',
    ],
    connectivity: 'Paderu, Munchingput, Visakhapatnam',
    base: 15,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-07',
    name: 'Munchingput',
    stops: [
      'Munchingput Bus Stop',
      'Jolaput',
      'Kilagada',
      'Baramanaguda',
      'Paderu',
      'Pedabayalu',
      'Odisha Border',
    ],
    connectivity: 'Paderu, Pedabayalu, Odisha border routes',
    base: 17,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-08',
    name: 'G. Madugula',
    stops: [
      'G. Madugula Bus Stop',
      'Nurmathi',
      'Gemmeli',
      'Gaduthuru',
      'Paderu',
      'Chintapalli',
    ],
    connectivity: 'Paderu, Chintapalli',
    base: 13,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-09',
    name: 'Chintapalli',
    stops: [
      'Chintapalli RTC Bus Stand',
      'Lambasingi Junction',
      'Tajangi',
      'Lothugedda',
      'Narsipatnam',
      'Visakhapatnam',
      'Paderu',
      'Sileru',
    ],
    connectivity: 'Narsipatnam, Visakhapatnam, Paderu, Sileru',
    base: 18,
    frequency: 'Paderu departures listed on Bus Timings page',
  },
  {
    id: 'ASR-10',
    name: 'G.K. Veedhi',
    stops: [
      'Gudem Kotha Veedhi Bus Stop',
      'Dharakonda',
      'Sileru',
      'Donkarayi',
      'R.V. Nagar',
      'Chintapalli',
      'Bhadrachalam',
      'Narsipatnam',
    ],
    connectivity: 'Chintapalli, Bhadrachalam, Narsipatnam',
    base: 20,
    frequency: 'Schedule not provided',
  },
  {
    id: 'ASR-11',
    name: 'Koyyuru',
    stops: [
      'Koyyuru Bus Stop',
      'Mampa',
      'Rajendrapalem',
      'Cheedikada Junction',
      'Narsipatnam',
      'Chintapalli',
      'Rajahmundry',
    ],
    connectivity: 'Narsipatnam, Chintapalli, Rajahmundry',
    base: 14,
    frequency: 'Schedule not provided',
  },
];

export const scheduleDetails = [
  {
    from: 'Paderu',
    to: 'Araku Valley',
    service: 'Express and Seater',
    serviceTe: 'ఎక్స్‌ప్రెస్ మరియు సీటర్',
    departures: ['08:00 AM', '11:00 AM', '02:00 PM', '04:45 PM'],
    return: 'Araku Valley to Paderu: services start around 05:00 AM and run into the evening; exact return times were not provided.',
    returnTe: 'Araku Valley నుంచి Paderu వరకు: సేవలు సుమారు 05:00 AM నుంచి సాయంత్రం వరకు ఉంటాయి; ఖచ్చితమైన తిరుగు సమయాలు అందించలేదు.',
  },
  {
    from: 'Paderu',
    to: 'Chintapalli',
    service: 'Pallevelugu (2+1) and other services',
    serviceTe: 'పల్లెవెలుగు (2+1) మరియు ఇతర సర్వీసులు',
    departures: ['07:00 AM', '08:00 AM', '09:00 AM', '12:00 PM', '01:00 PM'],
  },
  {
    from: 'Paderu',
    to: 'Visakhapatnam',
    service: 'Express and regional',
    serviceTe: 'ఎక్స్‌ప్రెస్ మరియు ప్రాంతీయ సర్వీసులు',
    departures: ['05:15 AM', '09:30 AM', '12:00 PM'],
  },
  {
    from: 'Araku Valley',
    to: 'S. Kota and Visakhapatnam',
    service: 'Ultra Deluxe and Ordinary',
    serviceTe: 'అల్ట్రా డీలక్స్ మరియు సాధారణ సర్వీసులు',
    note: 'Frequent connections via S. Kota continue into the evening. Exact departure times were not provided.',
    noteTe: 'S. Kota ద్వారా సాయంత్రం వరకు తరచుగా సర్వీసులు ఉన్నాయి. ఖచ్చితమైన బయలుదేరు సమయాలు అందించలేదు.',
  },
  {
    from: 'Araku',
    to: 'Paderu → Chintapalli → Upper Sileru → Chinturu → Bhadrachalam',
    service: 'Long-distance / ghat corridor',
    serviceTe: 'దూరప్రాంత / ఘాట్ మార్గం',
    departures: ['01:00 PM'],
    note: 'Example departure; operating days and other departures were not specified.',
    noteTe: 'ఇది ఒక ఉదాహరణ సమయం మాత్రమే; నడిచే రోజులు, ఇతర సమయాలు అందించలేదు.',
  },
];

export const demoFleet = [
  { id: 'A', vehicleNumber: 'DEMO-BUS-001', driverName: 'Demo Driver A', seatCapacity: 52, passengers: 32 },
  { id: 'B', vehicleNumber: 'DEMO-BUS-002', driverName: 'Demo Driver B', seatCapacity: 52, passengers: 40 },
];

export const guide = {
  routes,
  stops: [...new Set(routes.flatMap(route => route.stops))],
  schedules: scheduleDetails,
  fleet: demoFleet,
};

export function routeForTrip(routeId, from, to) {
  const route = guide.routes.find(item => item.id === routeId);
  return from !== to && route?.stops.includes(from) && route.stops.includes(to) ? route : null;
}
