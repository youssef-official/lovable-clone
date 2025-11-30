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
        <h1 className="text-3xl md:text-5xl font-extrabold text-center tracking-tight">
          Pricing Plans
        </h1>
        <p className="text-muted-foreground text-center text-base md:text-lg max-w-lg mx-auto">
          Start building your dream projects with the power of AI. Choose the plan that fits you best.
        </p>
        <div className="flex justify-center mt-8">
          <PricingTable
            appearance={{
              baseTheme: currentTheme === "dark" ? dark : undefined,
              elements: {
                pricingTable: "mx-auto",
                pricingTableCard: "border shadow-lg rounded-xl",
              },
            }}
          />
        </div>
      </section>
    </div>
  );
};

export default Page;
