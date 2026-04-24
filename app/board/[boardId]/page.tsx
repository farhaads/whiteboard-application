import nextDynamic from "next/dynamic";

/** Client-only board; avoid prerender/static-path worker pulling a broken split chunk. */
export const dynamic = "force-dynamic";

const BoardCanvas = nextDynamic(
  () =>
    import("@/components/board/BoardCanvas").then((mod) => mod.BoardCanvas),
  { ssr: false }
);

export default function BoardPage({
  params,
}: {
  params: { boardId: string };
}) {
  return <BoardCanvas boardId={params.boardId} />;
}
