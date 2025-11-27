import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCardIcon } from "lucide-react";

export const CreditCardSection = () => {
  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Credit Card
        </CardTitle>
        <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">**** **** **** 4242</div>
        <p className="text-xs text-muted-foreground">
          Expires 12/26
        </p>
      </CardContent>
    </Card>
  );
};
