import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isContentAdmin } from "@/lib/content-pipeline/auth";
import ContentPipelineNav from "@/components/content-pipeline/ContentPipelineNav";

export default async function ContentPipelineLayout({ children }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!(await isContentAdmin(userId))) redirect("/");

  return (
    <div className="min-h-screen bg-[#08090F] text-[#F5F6F8]">
      <ContentPipelineNav />
      <main className="max-w-6xl mx-auto p-6">{children}</main>
    </div>
  );
}
