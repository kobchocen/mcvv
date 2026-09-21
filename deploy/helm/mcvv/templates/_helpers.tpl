{{- define "mcvv.name" -}}
{{- printf "%s-mcvv" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "mcvv.labels" -}}
app.kubernetes.io/name: mcvv
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}
{{- define "mcvv.image" -}}
{{- $repository := required "image.repository is required" .Values.image.repository -}}
{{- if .Values.image.digest -}}
{{ printf "%s@%s" $repository .Values.image.digest }}
{{- else -}}
{{ printf "%s:%s" $repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end -}}
{{- end -}}
