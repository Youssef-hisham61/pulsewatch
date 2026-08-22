{{/*
Chart name and version, sanitized for use as a label value.
*/}}
{{- define "pulsewatch.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels applied to every resource's metadata (not used as selectors —
selectors stay as app/component so they remain immutable across upgrades).
*/}}
{{- define "pulsewatch.commonLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: pulsewatch
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ include "pulsewatch.chart" . }}
{{- end -}}
