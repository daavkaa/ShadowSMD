import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-xl font-extrabold">Хуудас олдсонгүй</h1>
      <Link href="/mn" className="mt-4 inline-block font-bold underline">Нүүр хуудас</Link>
    </main>
  );
}
