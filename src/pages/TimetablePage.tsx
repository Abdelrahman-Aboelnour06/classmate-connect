import PageLayout from "@/components/PageLayout";

export default function TimetablePage() {
  return (
    <PageLayout title="Timetable Generator">
      <div className="max-w-4xl mx-auto text-center py-20">
        <h2 className="font-display text-2xl font-bold text-foreground">Timetable Generator</h2>
        <p className="mt-2 text-muted-foreground">Coming soon — select courses and generate conflict-free timetables.</p>
      </div>
    </PageLayout>
  );
}
