import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { BrandLogo } from '@/components/drive/BrandLogo'
import { API_URL } from '@/lib/api'

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative group">
      <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-50"><code>{children}</code></pre>
      <button onClick={() => { navigator.clipboard.writeText(children).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        className="absolute right-2 top-2 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-white">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const colors: Record<string, string> = { GET: 'text-green-500', POST: 'text-blue-500', DELETE: 'text-red-500', PATCH: 'text-yellow-500' }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono">
      <span className={`font-bold ${colors[method] ?? 'text-slate-500'}`}>{method}</span>
      <span className="text-slate-950">{path}</span>
      <span className="ml-auto text-xs text-slate-500">{description}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="mb-4 text-2xl font-extrabold text-slate-950">{title}</h2>
      {children}
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-lg font-bold text-slate-950">{title}</h3>
      {children}
    </div>
  )
}

const BASE_URL = API_URL

export function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center gap-3">
          <BrandLogo className="h-10 w-10" />
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">9Drive API</h1>
            <p className="text-sm text-slate-500">REST API documentation for third-party integrations</p>
          </div>
        </div>

        <Section title="Base URL">
          <Code>{BASE_URL}</Code>
        </Section>

        <Section title="Authentication">
          <p className="mb-4 text-sm text-slate-600">All API requests require an API key sent via the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">X-API-Key</code> header.</p>
          <SubSection title="Generate API Key">
            <p className="mb-3 text-sm text-slate-600">Generate an API key from the Settings page in 9Drive web app.</p>
            <ol className="mb-4 list-inside list-decimal space-y-1 text-sm text-slate-600">
              <li>Login to 9Drive</li>
              <li>Go to <strong>Settings</strong></li>
              <li>Scroll to <strong>API Keys</strong> section</li>
              <li>Enter a name and click <strong>Create</strong></li>
              <li>Copy the key immediately — it won't be shown again</li>
            </ol>
          </SubSection>
          <SubSection title="Usage">
            <p className="mb-3 text-sm text-slate-600">Include the API key in every request:</p>
            <Code>{`curl -H "X-API-Key: 9d_<your_api_key>" ${BASE_URL}/files`}</Code>
          </SubSection>
          <SubSection title="Error Codes">
            <div className="grid gap-2 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><code className="font-mono font-semibold text-red-600">API_KEY_INVALID</code><span className="ml-3 text-slate-600">API key is invalid, revoked, or expired.</span></div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><code className="font-mono font-semibold text-red-600">API_KEY_REQUIRED</code><span className="ml-3 text-slate-600">Missing X-API-Key header.</span></div>
            </div>
          </SubSection>
        </Section>

        <Section title="Upload File">
          <div className="mb-4 grid gap-2">
            <Endpoint method="POST" path="/uploads" description="Upload one or more files" />
          </div>

          <SubSection title="Simple Upload (auto-detect)">
            <p className="mb-3 text-sm text-slate-600">Upload without specifying metadata — filename and type are auto-detected.</p>
            <Code>{`curl -X POST ${BASE_URL}/uploads \\
  -H "X-API-Key: 9d_<your_api_key>" \\
  -F "file-0=@video.mp4"`}</Code>
          </SubSection>

          <SubSection title="Upload to Specific Folder">
            <p className="mb-3 text-sm text-slate-600">Specify a folder by name or UUID. Returns error if folder doesn't exist.</p>
            <Code>{`# By folder name
curl -X POST ${BASE_URL}/uploads \\
  -H "X-API-Key: 9d_<your_api_key>" \\
  -F "folder=MyFolder" \\
  -F "file-0=@video.mp4"

# By folder UUID
curl -X POST ${BASE_URL}/uploads \\
  -H "X-API-Key: 9d_<your_api_key>" \\
  -F "folderId=UUID_FOLDER" \\
  -F "file-0=@video.mp4"`}</Code>
          </SubSection>

          <SubSection title="Batch Upload with Metadata">
            <p className="mb-3 text-sm text-slate-600">Send multiple files with explicit metadata via <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">filesMeta</code>.</p>
            <Code>{`curl -X POST ${BASE_URL}/uploads \\
  -H "X-API-Key: 9d_<your_api_key>" \\
  -F 'filesMeta=[
    {"fieldName":"file-0","fileName":"doc.pdf","mimeType":"application/pdf","sizeBytes":200000},
    {"fieldName":"file-1","fileName":"photo.jpg","mimeType":"image/jpeg","sizeBytes":500000}
  ]' \\
  -F "file-0=@/path/to/doc.pdf" \\
  -F "file-1=@/path/to/photo.jpg"`}</Code>
          </SubSection>

          <SubSection title="Upload Error Codes">
            <div className="grid gap-2 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><code className="font-mono font-semibold text-red-600">UPLOAD_TOO_LARGE</code><span className="ml-3 text-slate-600">File exceeds max upload size (default 5GB).</span></div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><code className="font-mono font-semibold text-red-600">NO_ACCOUNT_WITH_ENOUGH_SPACE</code><span className="ml-3 text-slate-600">No connected Google Drive has enough space.</span></div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><code className="font-mono font-semibold text-red-600">FOLDER_NOT_FOUND</code><span className="ml-3 text-slate-600">Specified folder does not exist.</span></div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><code className="font-mono font-semibold text-red-600">UPLOAD_SIZE_MISMATCH</code><span className="ml-3 text-slate-600">Actual file size differs from declared sizeBytes.</span></div>
            </div>
          </SubSection>
        </Section>

        <Section title="List Files">
          <div className="mb-4 grid gap-2">
            <Endpoint method="GET" path="/files" description="List all active files" />
            <Endpoint method="GET" path="/files?folderId=UUID" description="Filter by folder" />
            <Endpoint method="GET" path="/files?q=keyword" description="Search files by name" />
          </div>

          <SubSection title="Examples">
            <Code>{`# List all files
curl -s ${BASE_URL}/files -H "X-API-Key: 9d_<your_api_key>"

# List files in a specific folder
curl -s "${BASE_URL}/files?folderId=d01f9766-3de3-453e-a73f-6d2db3634a73" \\
  -H "X-API-Key: 9d_<your_api_key>"

# Search files by name
curl -s "${BASE_URL}/files?q=backup" \\
  -H "X-API-Key: 9d_<your_api_key>"`}</Code>
          </SubSection>

          <SubSection title="Response Format">
            <Code>{`{
  "files": [
    {
      "id": "82c44985-...",
      "name": "ZTE_TANGERANG.cfg",
      "mimeType": "text/plain",
      "sizeBytes": "1128389",
      "folderId": "d01f9766-...",
      "folderName": "BACKUPROUTER",
      "createdAt": "2026-06-25T14:41:53.966Z"
    }
  ]
}`}</Code>
          </SubSection>
        </Section>

        <Section title="Get File Detail">
          <div className="mb-4 grid gap-2">
            <Endpoint method="GET" path="/files/:id" description="Get single file metadata" />
          </div>
          <Code>{`curl -s ${BASE_URL}/files/82c44985-4305-4311-97f5-7ef5c8475286 \\
  -H "X-API-Key: 9d_<your_api_key>"`}</Code>
        </Section>

        <Section title="Download File">
          <div className="mb-4 grid gap-2">
            <Endpoint method="GET" path="/files/:id/download" description="Stream file download from Google Drive" />
          </div>
          <p className="mb-3 text-sm text-slate-600">Files are streamed directly from Google Drive. Supports range requests for video seeking.</p>
          <Code>{`# Download to file
curl -s ${BASE_URL}/files/82c44985-4305-4311-97f5-7ef5c8475286/download \\
  -H "X-API-Key: 9d_<your_api_key>" \\
  -o filename.cfg

# View response headers only
curl -sI ${BASE_URL}/files/82c44985-4305-4311-97f5-7ef5c8475286/download \\
  -H "X-API-Key: 9d_<your_api_key>"`}</Code>
        </Section>

        <Section title="API Key Management">
          <div className="mb-4 grid gap-2">
            <Endpoint method="GET" path="/api-keys" description="List your API keys" />
            <Endpoint method="POST" path="/api-keys" description="Generate a new API key" />
            <Endpoint method="DELETE" path="/api-keys/:id" description="Revoke an API key" />
          </div>

          <SubSection title="List Keys">
            <p className="mb-3 text-sm text-slate-600">These endpoints require JWT auth (not API key). Use Bearer token from web login.</p>
            <Code>{`curl -s ${BASE_URL}/api-keys \\
  -H "Authorization: Bearer <access_token>"`}</Code>
          </SubSection>

          <SubSection title="Generate Key">
            <Code>{`curl -s -X POST ${BASE_URL}/api-keys \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My Project 3"}'`}</Code>
          </SubSection>

          <SubSection title="Revoke Key">
            <Code>{`curl -s -X DELETE ${BASE_URL}/api-keys/KEY_UUID \\
  -H "Authorization: Bearer <access_token>"`}</Code>
          </SubSection>
        </Section>

        <footer className="mt-20 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <p>9Drive &copy; {new Date().getFullYear()} &mdash; Built with Google Drive integration</p>
        </footer>
      </div>
    </div>
  )
}
