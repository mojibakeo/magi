"use client"

import type { FC } from "react"
import { useCallback, useRef } from "react"
import type { FileAttachment } from "@/types/llm"

type FileUploadProps = {
  files: FileAttachment[]
  onFilesChange: (files: FileAttachment[]) => void
  disabled?: boolean
}

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
  "application/pdf",
]

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(",")[1]
      resolve(base64 ?? "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const FileUpload: FC<FileUploadProps> = ({
  files,
  onFilesChange,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files
      if (!selectedFiles) return

      const newFiles: FileAttachment[] = []
      for (const file of Array.from(selectedFiles)) {
        if (ACCEPTED_TYPES.includes(file.type)) {
          const data = await readFileAsBase64(file)
          newFiles.push({
            name: file.name,
            mimeType: file.type,
            data,
          })
        }
      }

      onFilesChange([...files, ...newFiles])
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    },
    [files, onFilesChange]
  )

  const handleRemove = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index))
    },
    [files, onFilesChange]
  )

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-1 rounded-md bg-[var(--card-bg)] px-2 py-1 text-xs"
            >
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button
                onClick={() => handleRemove(index)}
                className="text-gray-500 hover:text-red-400"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={disabled}
        type="button"
        className="flex items-center gap-1 text-gray-500 hover:text-gray-300 disabled:opacity-50 text-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
        Attach file
      </button>
    </div>
  )
}
