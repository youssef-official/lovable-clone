"use client";

import Image from "next/image";
import { PricingTable } from "@clerk/nextjs";
import { useCurrentTheme } from "@/hooks/use-current-theme";
import { dark } from "@clerk/themes";

const Page = () => {
  const currentTheme = useCurrentTheme();

  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full px-4">
      <section className="space-y-6 pt-[12vh] 2xl:pt-48 pb-12">
        <div className="flex flex-col items-center">
          <Image
            src="/logo.svg"
            alt="Vibe"
            width={60}
            height={60}
            className="hidden md:block drop-shadow-md"
          />
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-center tracking-tight bg-gradient-to-r from-orange-600 to-orange-400 bg-clip-text text-transparent">
          Pricing Plans
        </h1>
        <p className="text-muted-foreground text-center text-base md:text-lg max-w-lg mx-auto">
          Start building your dream projects with the power of AI. Choose the plan that fits you best.
        </p>
        <div className="flex justify-center mt-8">
          <PricingTable
            appearance={{
              baseTheme: currentTheme === "dark" ? dark : undefined,
              variables: {
                colorPrimary: "#f97316", // Orange-500
                colorTextOnPrimaryBackground: "white",
                borderRadius: "0.75rem",
              },
              elements: {
                pricingTable: "mx-auto",
                pricingTableCard:
                  "border border-orange-200/20 dark:border-orange-900/20 shadow-xl hover:shadow-2xl transition-all duration-300 rounded-xl! bg-background/50 backdrop-blur-sm",
                headerTitle: "text-2xl font-bold",
                headerSubtitle: "text-muted-foreground",
                pricingTableItem: "py-2",
                pricingTableButton:
                  "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-orange-500/25 transition-all",
              },
            }}
          />
        </div>
      </section>
    </div>
  );
};

export default Page;
