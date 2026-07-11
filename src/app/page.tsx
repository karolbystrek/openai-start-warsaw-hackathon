import { ShoppingChat } from "@/app/shopping-chat";

export default async function Home({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  return <ShoppingChat initialChatId={chat ?? null} key={chat ?? "new"} />;
}
