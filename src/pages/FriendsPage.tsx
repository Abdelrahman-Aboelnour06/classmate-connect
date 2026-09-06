"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/PageLayout";
import {
  searchStudents,
  analyzeFriendsAndEnemies,
  FriendsAndEnemiesAnalysis,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightning as Zap, Plus, X } from "@phosphor-icons/react";
import {
  getSelfStudent,
  setSelfStudent,
  clearSelfStudent,
  getFriendsList,
  addFriend,
  removeFriend,
  getEnemiesList,
  addEnemy,
  removeEnemy,
} from "@/lib/friends-enemies-storage";
import { toast } from "@/components/ui/use-toast";

export default function FriendsPage() {
  const [selfStudent, setSelfStudentState] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [enemies, setEnemies] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<FriendsAndEnemiesAnalysis[] | null>(null);
  const [searchMode, setSearchMode] = useState<"self" | "friends" | "enemies" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    setSelfStudentState(getSelfStudent());
    setFriends(getFriendsList());
    setEnemies(getEnemiesList());
  }, []);

  // Search students
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["search-students", searchQuery],
    queryFn: () => searchStudents(searchQuery),
    enabled: searchQuery.length > 0,
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: () => {
      if (!selfStudent) throw new Error("Please select yourself first");
      return analyzeFriendsAndEnemies(
        selfStudent.student_id,
        friends.map((f) => f.student_id),
        enemies.map((e) => e.student_id)
      );
    },
    onSuccess: (data) => {
      setAnalysis(data.analysis);
      toast({
        title: "Analysis Complete",
        description: `Analyzed ${data.analysis.length} classes`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSelectSelf = (student: any) => {
    setSelfStudentState(student);
    setSelfStudent(student);
    setSearchMode(null);
    setSearchQuery("");
    toast({
      title: "Self Selected",
      description: `You are ${student.student_name}`,
    });
  };

  const handleAddFriend = (student: any) => {
    if (selfStudent && student.student_id === selfStudent.student_id) {
      toast({
        title: "Can't Add",
        description: "You can't add yourself as a friend",
        variant: "destructive",
      });
      return;
    }
    if (enemies.find((e) => e.student_id === student.student_id)) {
      toast({
        title: "Can't Add",
        description: "This student is already in your enemies list",
        variant: "destructive",
      });
      return;
    }
    addFriend(student);
    setFriends([...friends.filter((f) => f.student_id !== student.student_id), student]);
    setSearchMode(null);
    setSearchQuery("");
    toast({
      title: "Friend Added",
      description: student.student_name,
    });
  };

  const handleRemoveFriend = (studentId: string) => {
    removeFriend(studentId);
    setFriends(friends.filter((f) => f.student_id !== studentId));
  };

  const handleAddEnemy = (student: any) => {
    if (selfStudent && student.student_id === selfStudent.student_id) {
      toast({
        title: "Can't Add",
        description: "You can't add yourself as an enemy",
        variant: "destructive",
      });
      return;
    }
    if (friends.find((f) => f.student_id === student.student_id)) {
      toast({
        title: "Can't Add",
        description: "This student is already in your friends list",
        variant: "destructive",
      });
      return;
    }
    addEnemy(student);
    setEnemies([...enemies.filter((e) => e.student_id !== student.student_id), student]);
    setSearchMode(null);
    setSearchQuery("");
    toast({
      title: "Enemy Added",
      description: student.student_name,
    });
  };

  const handleRemoveEnemy = (studentId: string) => {
    removeEnemy(studentId);
    setEnemies(enemies.filter((e) => e.student_id !== studentId));
  };

  const handleClearSelf = () => {
    clearSelfStudent();
    setSelfStudentState(null);
    setAnalysis(null);
  };

  return (
    <PageLayout title="Friends & Enemies">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Friends & Enemies</h1>
          <p className="text-muted-foreground">
            Compare your schedule with friends and enemies to see who shares each class with you.
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Self Student Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">You</CardTitle>
              <CardDescription>Select your student profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selfStudent ? (
                <div className="space-y-2">
                  {searchMode !== "self" ? (
                    <Button
                      onClick={() => setSearchMode("self")}
                      variant="outline"
                      className="w-full"
                    >
                      Search for yourself
                    </Button>
                  ) : (
                    <>
                      <Input
                        placeholder="Search by ID or name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                      {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {searchResults?.map((student) => (
                          <button
                            key={student.student_id}
                            onClick={() => handleSelectSelf(student)}
                            className="block w-full text-left p-2 rounded hover:bg-accent text-sm"
                          >
                            <div className="font-medium">{student.student_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {student.student_id}
                            </div>
                          </button>
                        ))}
                      </div>
                      <Button
                        onClick={() => {
                          setSearchMode(null);
                          setSearchQuery("");
                        }}
                        variant="ghost"
                        className="w-full text-xs"
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 rounded bg-blue-50 dark:bg-blue-950">
                    <div className="font-medium">{selfStudent.student_name}</div>
                    <div className="text-xs text-muted-foreground">{selfStudent.student_id}</div>
                  </div>
                  <Button
                    onClick={handleClearSelf}
                    variant="outline"
                    className="w-full text-xs"
                  >
                    Change
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Friends Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Friends</CardTitle>
              <CardDescription>{friends.length} selected</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {searchMode !== "friends" ? (
                <Button
                  onClick={() => setSearchMode("friends")}
                  variant="outline"
                  className="w-full text-green-600"
                  disabled={!selfStudent}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Friend
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="Search by ID or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {searchResults?.map((student) => (
                      <button
                        key={student.student_id}
                        onClick={() => handleAddFriend(student)}
                        className="block w-full text-left p-2 rounded hover:bg-accent text-sm"
                      >
                        <div className="font-medium">{student.student_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {student.student_id}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={() => {
                      setSearchMode(null);
                      setSearchQuery("");
                    }}
                    variant="ghost"
                    className="w-full text-xs"
                  >
                    Done
                  </Button>
                </>
              )}

              {friends.length > 0 && (
                <div className="space-y-2 pt-3 border-t">
                  {friends.map((friend) => (
                    <div
                      key={friend.student_id}
                      className="flex items-center justify-between p-2 rounded bg-green-50 dark:bg-green-950 text-sm"
                    >
                      <div>
                        <div className="font-medium text-green-900 dark:text-green-100">
                          {friend.student_name}
                        </div>
                        <div className="text-xs text-green-700 dark:text-green-300">
                          {friend.student_id}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFriend(friend.student_id)}
                        className="p-1 hover:bg-green-200 dark:hover:bg-green-800 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enemies Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Enemies</CardTitle>
              <CardDescription>{enemies.length} selected</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {searchMode !== "enemies" ? (
                <Button
                  onClick={() => setSearchMode("enemies")}
                  variant="outline"
                  className="w-full text-red-600"
                  disabled={!selfStudent}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Enemy
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="Search by ID or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {searchResults?.map((student) => (
                      <button
                        key={student.student_id}
                        onClick={() => handleAddEnemy(student)}
                        className="block w-full text-left p-2 rounded hover:bg-accent text-sm"
                      >
                        <div className="font-medium">{student.student_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {student.student_id}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={() => {
                      setSearchMode(null);
                      setSearchQuery("");
                    }}
                    variant="ghost"
                    className="w-full text-xs"
                  >
                    Done
                  </Button>
                </>
              )}

              {enemies.length > 0 && (
                <div className="space-y-2 pt-3 border-t">
                  {enemies.map((enemy) => (
                    <div
                      key={enemy.student_id}
                      className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-950 text-sm"
                    >
                      <div>
                        <div className="font-medium text-red-900 dark:text-red-100">
                          {enemy.student_name}
                        </div>
                        <div className="text-xs text-red-700 dark:text-red-300">
                          {enemy.student_id}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveEnemy(enemy.student_id)}
                        className="p-1 hover:bg-red-200 dark:hover:bg-red-800 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Analyze Button */}
        {selfStudent && (friends.length > 0 || enemies.length > 0) && (
          <div className="flex justify-center">
            <Button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              size="lg"
              className="gap-2"
            >
              <Zap className="w-5 h-5" />
              {analyzeMutation.isPending ? "Analyzing..." : "Analyze Schedule"}
            </Button>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && analysis.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Your Classes Analysis</h2>

            {/* Legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-200 dark:bg-blue-800"></div>
                <span className="text-sm">Friends Only</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-pink-200 dark:bg-pink-800"></div>
                <span className="text-sm">Enemies Only</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-200 dark:bg-yellow-800"></div>
                <span className="text-sm">Both</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-teal-200 dark:bg-teal-800"></div>
                <span className="text-sm">Alone</span>
              </div>
            </div>

            {/* Classes by Category */}
            {[
              { category: "friends-only", label: "Friends Only", color: "blue" },
              { category: "enemies-only", label: "Enemies Only", color: "pink" },
              { category: "both", label: "Both Friends & Enemies", color: "yellow" },
              { category: "alone", label: "Alone", color: "teal" },
            ].map(({ category, label, color }) => {
              const classes = analysis.filter((a) => a.category === category);
              if (classes.length === 0) return null;

              const colorClasses = {
                blue: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
                pink: "bg-pink-50 dark:bg-pink-950 border-pink-200 dark:border-pink-800",
                yellow: "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800",
                teal: "bg-teal-50 dark:bg-teal-950 border-teal-200 dark:border-teal-800",
              };

              return (
                <Card key={category} className={colorClasses[color as keyof typeof colorClasses]}>
                  <CardHeader>
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription>{classes.length} class(es)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {category === "enemies-only" && classes.length > 0 && (
                      <div className="mb-3 p-2 rounded bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 text-sm">
                        ⚠️ You're alone with your enemies in these classes!
                      </div>
                    )}
                    {classes.map((cls, idx) => (
                      <div key={idx} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{cls.course_code}</div>
                            <div className="text-sm text-muted-foreground">
                              {cls.course_name}
                            </div>
                          </div>
                          <Badge variant="outline">{cls.class_type}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>📅 {cls.day_of_week}</span>
                          <span>⏰ {cls.start_time} - {cls.end_time}</span>
                          {cls.location && <span>📍 {cls.location}</span>}
                        </div>
                        {cls.friends.length > 0 && (
                          <div className="text-xs">
                            <span className="font-medium text-green-700 dark:text-green-300">
                              Friends ({cls.friends.length}):
                            </span>
                            <div className="text-green-600 dark:text-green-400 ml-2">
                              {cls.friends.map((f) => f.student_name).join(", ")}
                            </div>
                          </div>
                        )}
                        {cls.enemies.length > 0 && (
                          <div className="text-xs">
                            <span className="font-medium text-red-700 dark:text-red-300">
                              Enemies ({cls.enemies.length}):
                            </span>
                            <div className="text-red-600 dark:text-red-400 ml-2">
                              {cls.enemies.map((e) => e.student_name).join(", ")}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!analysis && selfStudent && (friends.length === 0 && enemies.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Add at least one friend or enemy to analyze your schedule</p>
            </CardContent>
          </Card>
        )}

        {!selfStudent && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>Select your student profile to get started</p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
