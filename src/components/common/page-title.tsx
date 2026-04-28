type PageTitleProps = {
  title: string;
  description?: string;
};

export function PageTitle({ title, description }: PageTitleProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
      {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
