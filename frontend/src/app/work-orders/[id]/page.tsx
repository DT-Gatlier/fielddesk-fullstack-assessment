import WorkOrderDetailsPage from "./client";

export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkOrderDetailsPage id={id} />;
}
