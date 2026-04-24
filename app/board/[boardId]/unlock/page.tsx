import { BoardUnlockForm } from "@/components/home/board-unlock-form";

export const dynamic = "force-dynamic";

export default function BoardUnlockPage({
  params,
}: {
  params: { boardId: string };
}) {
  return <BoardUnlockForm boardId={params.boardId} />;
}
