import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, ImageIcon, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const PAGE_COUNTS = [1, 2, 3, 4, 5] as const;
const SIZE_OPTIONS = [
  { id: "8.5x11-portrait", label: "8.5×11 Portrait" },
  { id: "8.5x11-landscape", label: "8.5×11 Landscape" },
  { id: "11x14", label: "11×14" },
  { id: "16x20", label: "16×20" },
  { id: "square", label: "Square" },
] as const;

type OutputStyle = "full-color" | "coloring";
type SizePreset = (typeof SIZE_OPTIONS)[number]["id"];
const TERMINAL_STATUSES = new Set(["complete", "partial", "error"]);

function ChoiceButton({ active, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button type="button" className={`studio-choice ${active ? "studio-choice--active" : ""}`} {...props}>{children}</button>;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [outputStyle, setOutputStyle] = useState<OutputStyle>("full-color");
  const [sizePreset, setSizePreset] = useState<SizePreset>("8.5x11-portrait");
  const [pageCount, setPageCount] = useState<(typeof PAGE_COUNTS)[number]>(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const jobQuery = trpc.generation.status.useQuery({ jobId: jobId ?? "" }, { enabled: Boolean(jobId), refetchInterval: jobId ? 1_500 : false });
  const advanceMutation = trpc.generation.advance.useMutation({
    onSuccess: () => jobId && utils.generation.status.invalidate({ jobId }),
    onError: error => toast.error(error.message),
  });
  const startMutation = trpc.generation.start.useMutation({
    onSuccess: job => { setJobId(job.id); toast.success("Your generation is ready to start."); },
    onError: error => toast.error(error.message),
  });
  const job = jobQuery.data;
  const isBusy = startMutation.isPending || (Boolean(jobId) && !TERMINAL_STATUSES.has(job?.status ?? "queued"));
  const progress = useMemo(() => job ? Math.round((job.currentPage / job.pageCount) * 100) : 0, [job]);
  const completedPages = job?.pageResults.filter(page => page.status === "success") ?? [];

  useEffect(() => {
    if (!jobId || !job || TERMINAL_STATUSES.has(job.status) || advanceMutation.isPending) return;
    const timer = window.setTimeout(() => advanceMutation.mutate({ jobId }), 250);
    return () => window.clearTimeout(timer);
  }, [advanceMutation, job, jobId]);

  const handleGenerate = () => {
    if (!prompt.trim()) { toast.error("Tell us what you would like to create first."); return; }
    setJobId(null);
    startMutation.mutate({ prompt: prompt.trim(), outputStyle, sizePreset, pageCount });
  };

  return <div className="studio-shell min-h-screen text-white">
    <header className="studio-header"><div className="container flex items-center justify-between py-4">
      <div className="flex items-center gap-3"><div className="studio-mark"><Wand2 className="h-4 w-4" /></div><div><h1 className="text-base font-semibold tracking-[-0.03em]">Production Studio</h1><p className="text-[11px] tracking-wide text-white/45">CREATE PRINT-READY ART PAGES</p></div></div>
      <span className="studio-badge">Customer Edition</span>
    </div></header>
    <main className="container py-8 lg:py-12">
      <div className="mb-8 max-w-2xl"><p className="studio-kicker">QUICK CREATE</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Make your next printable.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/58">Describe what you want to create, select the finished format, and download the completed PDF and individual pages.</p></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="studio-card"><CardHeader className="pb-5"><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-4 w-4 text-cyan-300" />Create a printable</CardTitle><CardDescription className="text-white/48">Every job is limited to five pages for consistent results.</CardDescription></CardHeader><CardContent className="space-y-6">
          <div className="space-y-2"><Label htmlFor="prompt">What do you want to create?</Label><Textarea id="prompt" rows={5} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={isBusy} placeholder="Example: A playful underwater world art page for kids, with friendly sea creatures, large open areas, and bold outlines." className="studio-textarea" /></div>
          <div className="space-y-2.5"><Label>Output style</Label><div className="flex flex-wrap gap-2"><ChoiceButton active={outputStyle === "full-color"} disabled={isBusy} onClick={() => setOutputStyle("full-color")}>Full Color</ChoiceButton><ChoiceButton active={outputStyle === "coloring"} disabled={isBusy} onClick={() => setOutputStyle("coloring")}>Coloring</ChoiceButton></div></div>
          <div className="space-y-2.5"><Label>Finished size</Label><div className="flex flex-wrap gap-2">{SIZE_OPTIONS.map(option => <ChoiceButton key={option.id} active={sizePreset === option.id} disabled={isBusy} onClick={() => setSizePreset(option.id)}>{option.label}</ChoiceButton>)}</div></div>
          <div className="space-y-2.5"><Label>Pages <span className="ml-1 text-xs font-normal text-white/38">(1–5 only)</span></Label><div className="flex gap-2">{PAGE_COUNTS.map(count => <ChoiceButton key={count} active={pageCount === count} disabled={isBusy} onClick={() => setPageCount(count)}>{count}</ChoiceButton>)}</div></div>
          <Button disabled={isBusy || !prompt.trim()} onClick={handleGenerate} size="lg" className="studio-generate w-full">{isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{isBusy ? "Creating your pages..." : `Generate ${pageCount} Page${pageCount === 1 ? "" : "s"}`}</Button>
        </CardContent></Card>
        <Card className="studio-card studio-output-card"><CardHeader className="pb-5"><CardTitle className="text-lg">Your output</CardTitle><CardDescription className="text-white/48">Live progress and completed downloads appear here.</CardDescription></CardHeader><CardContent>
          {!job && <div className="studio-empty flex min-h-[420px] flex-col items-center justify-center text-center"><div className="studio-empty-icon"><ImageIcon className="h-6 w-6" /></div><h3 className="mt-5 text-sm font-medium">Your pages will appear here</h3><p className="mt-2 max-w-60 text-xs leading-5 text-white/42">Describe your idea, then click Generate to begin.</p></div>}
          {job && <div className="space-y-5"><div className="rounded-xl border border-white/8 bg-black/20 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium">{job.statusMessage}</p><p className="mt-1 text-xs text-white/43">{job.currentPage} of {job.pageCount} pages processed</p></div>{isBusy && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-cyan-200" />}</div><Progress value={progress} className="mt-4 h-1.5 bg-white/8" /></div>
            {job.errorMessage && <p className="rounded-lg border border-red-400/20 bg-red-400/8 p-3 text-xs leading-5 text-red-100">{job.errorMessage}</p>}
            {completedPages.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{completedPages.map(page => <a key={page.pageNumber} href={page.imageUrl} target="_blank" rel="noreferrer" className="studio-thumbnail"><img src={page.imageUrl} alt={`Completed page ${page.pageNumber}`} /><span>Page {page.pageNumber}</span></a>)}</div>}
            {job.pdfUrl && <div className="grid gap-2 sm:grid-cols-2"><Button asChild className="studio-download"><a href={job.pdfUrl} download={job.filename}><Download className="mr-2 h-4 w-4" />Download PDF</a></Button><Button asChild variant="outline" className="studio-preview"><a href={job.pdfUrl} target="_blank" rel="noreferrer"><FileText className="mr-2 h-4 w-4" />Preview</a></Button></div>}
            {completedPages.length > 0 && <div className="border-t border-white/8 pt-4"><p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-white/42">INDIVIDUAL PAGE DOWNLOADS</p><div className="flex flex-wrap gap-2">{completedPages.map(page => <a key={page.pageNumber} href={page.imageUrl} download={`scriptorium-page-${page.pageNumber}.png`} className="studio-page-link"><Download className="h-3 w-3" />PNG {page.pageNumber}</a>)}</div></div>}
          </div>}
        </CardContent></Card>
      </div>
    </main>
  </div>;
}
