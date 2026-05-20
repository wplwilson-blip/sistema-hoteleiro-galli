"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { ErrorMessage } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
const allowedExtensions = ["pdf", "jpg", "jpeg", "png"];

function validateFile(file: File) {
  if (file.size > MAX_RESUME_SIZE_BYTES) return "Arquivo excede o limite de 5 MB.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.includes(extension)) return "Tipo invalido. Envie PDF, JPG, JPEG ou PNG.";
  if (file.type && !allowedMimeTypes.includes(file.type)) return "Tipo invalido. Envie PDF, JPG, JPEG ou PNG.";
  return "";
}

async function uploadResume(url: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(url, {
    method: "POST",
    body: formData
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel enviar o curriculo.");
  }

  return payload;
}

export function HrCandidateResumeUpload({
  workflowId,
  candidateId,
  label = "Anexar curriculo",
  onUploaded
}: {
  workflowId: string;
  candidateId: string;
  label?: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState("");
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      return uploadResume(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/resume`, file);
    },
    onSuccess: () => {
      setLocalError("");
      if (inputRef.current) inputRef.current.value = "";
      onUploaded();
    }
  });

  function chooseFile() {
    setLocalError("");
    inputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationMessage = validateFile(file);
    if (validationMessage) {
      setLocalError(validationMessage);
      event.target.value = "";
      return;
    }

    mutation.mutate(file);
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={handleFileChange} />
      <Button type="button" size="sm" onClick={chooseFile} disabled={mutation.isPending}>
        <Upload className="h-4 w-4" />
        {mutation.isPending ? "Enviando..." : label}
      </Button>
      {localError ? <ErrorMessage message={localError} /> : null}
      {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel enviar o curriculo."} /> : null}
    </div>
  );
}
