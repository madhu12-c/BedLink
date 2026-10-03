/**
 * Mumbai government hospitals in the national hospital directory (Esri India Living Atlas
 * "India: Hospital Directory", built from government health facility data), pulled 3 Oct 2026.
 * Map points are the directory's; St. George, Cama, Nair and Shatabdi Govandi are corrected from
 * OpenStreetMap (the directory had placeholder points for them).
 * `inBedLink`: already on BedLink's dispatch list (with live beds), so not drawn twice on the map.
 */
export interface DirectoryHospital {
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  phone?: string;
  inBedLink?: boolean;
}

export const DIRECTORY_HOSPITALS: DirectoryHospital[] = [
  { name: 'KEM Hospital', area: 'Parel', latitude: 19.0005, longitude: 72.8462, phone: '022-24107000', inBedLink: true },
  { name: 'Lokmanya Tilak (Sion) Hospital', area: 'Sion', latitude: 19.0334, longitude: 72.8603, phone: '022-24076381', inBedLink: true },
  { name: 'Shatabdi (Centenary) Hospital', area: 'Kandivali', latitude: 19.2295, longitude: 72.8624, phone: '022-28050882', inBedLink: true },
  { name: 'Bhagwati Hospital', area: 'Borivali', latitude: 19.2394, longitude: 72.8547, inBedLink: true },
  { name: 'Siddharth Municipal Hospital', area: 'Goregaon', latitude: 19.1596, longitude: 72.841, phone: '022-28766885', inBedLink: true },
  { name: 'BYL Nair Hospital', area: 'Mumbai Central', latitude: 18.9701, longitude: 72.8194, phone: '022-23027000' },
  { name: 'Grant Medical College & Sir J.J. Hospital', area: 'Byculla', latitude: 18.9631, longitude: 72.8319, phone: '022-23743066' },
  { name: 'G.T. Hospital', area: 'Fort', latitude: 18.9468, longitude: 72.8328 },
  { name: 'St. George Hospital', area: 'Fort', latitude: 18.9407, longitude: 72.837, phone: '022-22620245' },
  { name: 'Cama and Albless Hospital', area: 'Fort', latitude: 18.942, longitude: 72.833 },
  { name: 'Kasturba Hospital', area: 'Mahalaxmi', latitude: 18.9825, longitude: 72.8292, phone: '022-23092458' },
  { name: 'GTB Hospital', area: 'Sewri', latitude: 19.0055, longitude: 72.8531, phone: '022-24146993' },
  { name: 'Potdar Hospital', area: 'Worli', latitude: 19.0022, longitude: 72.8163, phone: '022-24933533' },
  { name: 'ESIS Hospital', area: 'Worli', latitude: 18.9981, longitude: 72.8168, phone: '022-24932428' },
  { name: 'Central Railway Hospital', area: 'Byculla', latitude: 18.9801, longitude: 72.8336, phone: '022-23726588' },
  { name: 'INHS Asvini (Navy)', area: 'Colaba', latitude: 18.9012, longitude: 72.8158, phone: '022-22151641' },
  { name: 'S.A.J.B. Hospital', area: 'Fort', latitude: 18.9352, longitude: 72.8371, phone: '022-22042526' },
  { name: 'AIIPMR (rehabilitation)', area: 'Haji Ali', latitude: 18.9803, longitude: 72.8136, phone: '022-23544341' },
  { name: 'Nair Dental College Hospital', area: 'Mumbai Central', latitude: 18.9705, longitude: 72.819, phone: '022-23027000' },
  { name: 'Eye Hospital', area: 'Kamathipura', latitude: 18.9623, longitude: 72.8323, phone: '022-23082632' },
  { name: 'ICMR Hospital', area: 'Parel', latitude: 19.0015, longitude: 72.8419 },
  { name: 'K.B. Bhabha Hospital', area: 'Bandra', latitude: 19.057457, longitude: 72.833621, phone: '022-26504515' },
  { name: 'V.N. Desai Hospital', area: 'Santacruz', latitude: 19.0825, longitude: 72.8417, phone: '022-26182081' },
  { name: 'HBT Trauma Care Hospital', area: 'Jogeshwari', latitude: 19.139, longitude: 72.8645, phone: '022-28224088' },
  { name: 'ESIS Hospital', area: 'Andheri', latitude: 19.1232, longitude: 72.8714, phone: '022-28367205' },
  { name: 'Rajawadi Hospital', area: 'Ghatkopar', latitude: 19.0787, longitude: 72.9012 },
  { name: 'Sant Muktabai Hospital', area: 'Ghatkopar', latitude: 19.0997, longitude: 72.9029 },
  { name: 'Krantiveer Mahatma Jyotiba Phule Hospital', area: 'Vikhroli', latitude: 19.1182, longitude: 72.9387, phone: '022-25782283' },
  { name: 'M.T. Agarwal Hospital', area: 'Mulund', latitude: 19.1779, longitude: 72.9462, phone: '022-25692316' },
  { name: 'V.D. Savarkar Hospital', area: 'Mulund', latitude: 19.1746, longitude: 72.9431, phone: '022-21637362' },
  { name: 'Shatabdi (Centenary) Hospital', area: 'Govandi', latitude: 19.0496, longitude: 72.9111 }
];
