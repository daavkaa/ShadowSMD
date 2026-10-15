// Catalog structure + commercial catalog. Prices are TEST prices from the
// founder brief (MNT, VAT treatment to be confirmed with accountant).
export const academies = [
  { slug: "social-media-marketing", title: "Сошиал медиа маркетингийн академи", description: "Page тохиргооноос Meta зар сурталчилгаа, контент стратеги хүртэл.", status: "published", sort: 1 },
  { slug: "ai-skills", title: "AI ур чадварын академи", description: "Өдөр тутмын ажилд AI хэрэгслийг аюулгүй, үр дүнтэй ашиглах.", status: "published", sort: 2 },
];

export const tracks = [
  { slug: "smm-core", academy: "social-media-marketing", title: "Сошиал медиа маркетингийн суурь зам", status: "published", sort: 1 },
  { slug: "ai-everyday", academy: "ai-skills", title: "Ажлын AI хэрэгслүүд", status: "published", sort: 1 },
];

// Courses that are not yet built are shown as "coming_soon" — never sold as available.
export const comingSoonCourses = [
  { slug: "smm-content-strategy", track: "smm-core", title: "Сошиал медиа контент стратеги", summary: "Контент календарь, copywriting, богино видео, креатив бриф, аналитик.", sort: 2 },
  { slug: "ai-tools-for-work", track: "ai-everyday", title: "Өдөр тутмын ажилд AI хэрэгсэл", summary: "Судалгаа, prompt бичих, аюулгүй байдал, хүснэгт, контент бүтээх.", sort: 1 },
];

export const products = [
  {
    code: "pro_library", kind: "library_plan", name: "Professional — бүх стандарт сургалт", scope_kind: "library_pro",
    description: "Бүх стандарт сургалт, ахисан төслүүд, эцсийн шалгалт ба сертификат.",
    prices: [
      { code: "pro_month_prepaid", amount: 29900, interval: "month", access_days: 30 },
      { code: "pro_year_prepaid", amount: 249000, interval: "year", access_days: 365 },
    ],
  },
  {
    code: "student_library", kind: "library_plan", name: "Student — үндсэн сан", scope_kind: "library_core", requires_student_verification: true,
    description: "Оюутны эрх баталгаажуулсны дараа идэвхжинэ (баталгаажуулалт MVP-д хараахан нээгдээгүй).",
    prices: [
      { code: "student_month_prepaid", amount: 14900, interval: "month", access_days: 30 },
      { code: "student_year_prepaid", amount: 119000, interval: "year", access_days: 365 },
    ],
  },
  {
    code: "smm_bundle", kind: "bundle", name: "Маркетингийн сургалтын багц (нэг удаагийн)", scope_kind: "bundle",
    description: "Зөвхөн багцад нэрлэгдсэн сургалтууд. Ирээдүйн бусад сургалт орохгүй.",
    bundle_courses: ["smm-foundations", "smm-content-strategy"],
    prices: [{ code: "smm_bundle_once", amount: 299000, interval: "one_time", access_days: null }],
  },
  {
    code: "b2b_seat", kind: "b2b_seat", name: "Байгууллагын суудал (Professional)", scope_kind: "library_pro", audience: "b2b",
    description: "Байгууллагын нэхэмжлэлээр. Суудал бүр нэг идэвхтэй ажилтан.",
    prices: [{ code: "b2b_seat_10_19_month", amount: 15900, interval: "month", access_days: 30, min_quantity: 5 }],
  },
];
