{{/*
Common labels
*/}}
{{- define "chamelion.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "chamelion.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Database connection string
*/}}
{{- define "chamelion.dbHost" -}}
{{- if eq .Values.database.type "mongodb" -}}
{{ .Values.database.uri }}
{{- else -}}
{{ .Values.database.host }}:{{ .Values.database.port }}
{{- end -}}
{{- end }}
