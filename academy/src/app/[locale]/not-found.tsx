import Link from "next/link";
import { Card } from "@/components/ui";
export default function NotFound() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-extrabold">Хуудас олдсонгүй</h1>
      <p className="mt-2 text-muted">Холбоос буруу эсвэл танд энэ хуудсыг үзэх эрх байхгүй байж магадгүй.</p>
      <Link href="/mn" className="mt-4 inline-block font-bold text-primary-strong underline">Нүүр хуудас</Link>
    </Card>
  );
}
