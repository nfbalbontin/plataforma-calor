import { redirect } from "next/navigation";

export default async function VigilanciaRegion({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  redirect(`/vigilancia?region=${encodeURIComponent(region)}`);
}
