"use client";

import { useEffect, useState } from "react";
import { getAllUsageRecords, updateUserCredits } from "@/modules/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

interface UsageRecord {
  key: string;
  points: number;
  remainingPoints: number;
  expire: Date | null;
}

export const AdminDashboard = () => {
  const [users, setUsers] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit state
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [actionType, setActionType] = useState<'set' | 'add' | 'subtract'>('add');
  const [dialogOpen, setDialogOpen] = useState(false);

  // New user state
  const [newUserId, setNewUserId] = useState("");
  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getAllUsageRecords();
      setUsers(data);
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdate = async () => {
    if (!selectedUser) return;

    try {
      await updateUserCredits(selectedUser, amount, actionType);
      setDialogOpen(false);
      setAmount(0);
      toast.success("Credits updated successfully");
      fetchUsers();
    } catch (error) {
      console.error("Failed to update credits", error);
      toast.error("Failed to update credits");
    }
  };

  const handleCreateUser = async () => {
    if (!newUserId) return;
    try {
      await updateUserCredits(newUserId, amount, 'set');
      setNewUserDialogOpen(false);
      setNewUserId("");
      setAmount(0);
      toast.success("User credits set successfully");
      fetchUsers();
    } catch (error) {
      console.error("Failed to create/update user", error);
      toast.error("Failed to create/update user");
    }
  };

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
            <Button onClick={fetchUsers} variant="outline">
                <RefreshCcw className="w-4 h-4 mr-2" />
                Refresh
            </Button>
            <Dialog open={newUserDialogOpen} onOpenChange={setNewUserDialogOpen}>
            <DialogTrigger asChild>
                <Button>Add User / Credit</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                <DialogTitle>Manage User Credits</DialogTitle>
                <DialogDescription>
                    Add a new user record or update existing credits.
                </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>User ID</Label>
                    <Input
                        value={newUserId}
                        onChange={(e) => setNewUserId(e.target.value)}
                        placeholder="user_..."
                    />
                </div>
                <div className="space-y-2">
                    <Label>Initial Credits</Label>
                    <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    />
                </div>
                <Button onClick={handleCreateUser} className="w-full">Set Credits</Button>
                </div>
            </DialogContent>
            </Dialog>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Remaining Points</TableHead>
              <TableHead>Total Limit</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={4} className="text-center py-4">
                        {loading ? "Loading..." : "No users found."}
                    </TableCell>
                </TableRow>
            ) : (
                users.map((user) => (
                <TableRow key={user.key}>
                    <TableCell className="font-medium">{user.key}</TableCell>
                    <TableCell>{user.remainingPoints}</TableCell>
                    <TableCell>{user.points}</TableCell>
                    <TableCell className="text-right">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSelectedUser(user.key);
                            setAmount(0);
                            setActionType('add');
                            setDialogOpen(true);
                        }}
                    >
                        Edit Credits
                    </Button>
                    </TableCell>
                </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Credits for {selectedUser}</DialogTitle>
            <DialogDescription>
                Modify the credit balance for this user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={actionType}
                onValueChange={(val: any) => setActionType(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add</SelectItem>
                  <SelectItem value="subtract">Subtract</SelectItem>
                  <SelectItem value="set">Set To</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <Button onClick={handleUpdate} className="w-full">Update</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
