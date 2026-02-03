"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageCircle,
  Key,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  id: string;
  message_type: string;
  post_id: string;
  parent_id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  submolt_id: string;
  submolt_name: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  message_url: string;
  created_at: string;
  scanned_at: string;
  has_api_key: boolean;
  api_key_types: string[];
}

interface Stats {
  total: number;
  posts: number;
  comments: number;
  with_api_keys: number;
}

const PAGE_SIZE = 25;

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [apiKeyFilter, setApiKeyFilter] = useState<string>("all");

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/messages?stats=true");
      const data = await response.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let url = `/api/messages?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
      if (typeFilter !== "all") {
        url += `&type=${typeFilter}`;
      }
      if (apiKeyFilter !== "all") {
        url += `&has_api_key=${apiKeyFilter === "with_keys"}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setMessages(data.messages);
        setTotal(data.total);
      } else {
        setError(data.error || "Failed to load messages");
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter, apiKeyFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setPage(0);
  }, [typeFilter, apiKeyFilter]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleRefresh = () => {
    loadStats();
    loadMessages();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Scanned Messages
          </h1>
          <p className="text-muted-foreground">
            All posts and comments scanned from Moltbook
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Messages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <FileText className="h-4 w-4" /> Posts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.posts.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <MessageCircle className="h-4 w-4" /> Comments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.comments.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Key className="h-4 w-4" /> With API Keys
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.with_api_keys.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Type:</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="post">Posts only</SelectItem>
                  <SelectItem value="comment">Comments only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">API Keys:</label>
              <Select value={apiKeyFilter} onValueChange={setApiKeyFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All messages</SelectItem>
                  <SelectItem value="with_keys">With API keys</SelectItem>
                  <SelectItem value="no_keys">Without API keys</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Messages Table */}
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Showing {total > 0 ? page * PAGE_SIZE + 1 : 0} - {Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Submolt</TableHead>
                  <TableHead>Votes</TableHead>
                  <TableHead>API Keys</TableHead>
                  <TableHead>Scanned</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.length === 0 && !isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No messages found. The scanner will populate this table.
                    </TableCell>
                  </TableRow>
                ) : (
                  messages.map((msg) => (
                    <TableRow key={msg.id} className={msg.has_api_key ? "bg-red-50 dark:bg-red-950/30" : ""}>
                      <TableCell>
                        <Badge variant={msg.message_type === "post" ? "default" : "secondary"}>
                          {msg.message_type === "post" ? (
                            <><FileText className="h-3 w-3 mr-1" /> Post</>
                          ) : (
                            <><MessageCircle className="h-3 w-3 mr-1" /> Comment</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          {msg.title && (
                            <div className="font-medium truncate" title={msg.title}>
                              {msg.title}
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground truncate" title={msg.content}>
                            {msg.content.slice(0, 100)}{msg.content.length > 100 ? "..." : ""}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{msg.author_name}</TableCell>
                      <TableCell>
                        {msg.submolt_name ? (
                          <Badge variant="outline">m/{msg.submolt_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600">+{msg.upvotes}</span>
                        {" / "}
                        <span className="text-red-600">-{msg.downvotes}</span>
                      </TableCell>
                      <TableCell>
                        {msg.has_api_key ? (
                          <div className="flex flex-wrap gap-1">
                            {msg.api_key_types.map((type, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                <Key className="h-3 w-3 mr-1" />
                                {type}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(msg.scanned_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a
                            href={msg.message_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
