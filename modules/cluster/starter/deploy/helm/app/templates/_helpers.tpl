{{/* The name every object gets: <app>-<env> from the values, the same parts as docs/CONVENTIONS.md. */}}
{{- define "app.name" -}}
{{- printf "%s-%s" .Values.labels.app (.Values.labels.env | default "dev") | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* The labels on every object: the app's own (app, env, managed-by) and the ones Kubernetes tools read. */}}
{{- define "app.labels" -}}
{{- range $k, $v := .Values.labels }}
{{ $k }}: {{ $v | quote }}
{{- end }}
app.kubernetes.io/name: {{ .Values.labels.app | quote }}
app.kubernetes.io/instance: {{ include "app.name" . | quote }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
{{- end -}}

{{- define "app.selector" -}}
app.kubernetes.io/name: {{ .Values.labels.app | quote }}
app.kubernetes.io/instance: {{ include "app.name" . | quote }}
{{- end -}}
