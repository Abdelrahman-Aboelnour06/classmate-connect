import PageLayout from "@/components/PageLayout";

export default function TermsPage() {
  return (
    <PageLayout title="Terms and Conditions">
      <article className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="font-editorial text-4xl italic leading-tight text-foreground">Terms and Conditions</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated September 6, 2026.</p>
        </header>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Use of the service</h2>
          <p className="text-muted-foreground">Schedule Sync helps users search and compare course schedules. Use the service only for lawful academic planning and do not attempt to disrupt, probe, or access another account.</p>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Account responsibility</h2>
          <p className="text-muted-foreground">Keep your sign-in details private. You are responsible for activity performed through your account and should report suspected unauthorized access promptly.</p>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Data and availability</h2>
          <p className="text-muted-foreground">Schedule data may change as university sources are updated. The service is provided for convenience and does not replace official university records.</p>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Changes</h2>
          <p className="text-muted-foreground">These terms may be updated when the service changes. Continued use after an update means you accept the revised terms.</p>
        </section>
      </article>
    </PageLayout>
  );
}
