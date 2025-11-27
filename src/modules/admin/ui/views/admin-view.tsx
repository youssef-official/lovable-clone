"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const findUserSchema = z.object({
  query: z.string().min(1, { message: "Email or User ID is required" }),
});

const setCreditsSchema = z.object({
  points: z.coerce.number().int().min(0, { message: "Points must be a non-negative integer" }),
});

interface UserInfo {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export const AdminView = () => {
  const trpc = useTRPC();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const findUserForm = useForm<z.infer<typeof findUserSchema>>({
    resolver: zodResolver(findUserSchema),
    defaultValues: {
      query: "",
    },
  });

  // Use useQuery for findUser, but disable it initially and use refetch for manual trigger
  const findUserQuery = trpc.admin.findUser.useQuery(findUserForm.getValues(), {
    enabled: false, // Only run on manual submit
    onSuccess: (data) => {
      setUserInfo(data);
      toast.success("User found.");
    },
    onError: (error) => {
      setUserInfo(null);
      toast.error(error.message);
    },
  });

  const setCreditsMutation = trpc.admin.setCredits.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setCreditsForm.reset({ points: 0 });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const onFindUserSubmit = (values: z.infer<typeof findUserSchema>) => {
    // Manually trigger the query with the current form values
    findUserQuery.refetch();
  };

  const onSetCreditsSubmit = (values: z.infer<typeof setCreditsSchema>) => {
    if (!userInfo) {
      toast.error("Please find a user first.");
      return;
    }
    setCreditsMutation.mutate({
      userId: userInfo.id,
      points: values.points,
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <p className="text-muted-foreground">Manage user credits and access.</p>

      <Card>
        <CardHeader>
          <CardTitle>Find User</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...findUserForm}>
            <form onSubmit={findUserForm.handleSubmit(onFindUserSubmit)} className="space-y-4">
              <FormField
                control={findUserForm.control}
                name="query"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User Email or ID</FormLabel>
                    <FormControl>
                      <Input placeholder="user@example.com or user_..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={findUserQuery.isFetching}>
                {findUserQuery.isFetching ? "Searching..." : "Find User"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {userInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Set Credits for User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border p-4 rounded-md bg-muted/50">
              <p><strong>Name:</strong> {userInfo.firstName} {userInfo.lastName}</p>
              <p><strong>Email:</strong> {userInfo.email}</p>
              <p><strong>User ID:</strong> {userInfo.id}</p>
            </div>
            <Form {...setCreditsForm}>
              <form onSubmit={setCreditsForm.handleSubmit(onSetCreditsSubmit)} className="space-y-4">
                <FormField
                  control={setCreditsForm.control}
                  name="points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Credit Limit (Points)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={setCreditsMutation.isPending}>
                  {setCreditsMutation.isPending ? "Setting Credits..." : "Set Credits"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
