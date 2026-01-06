FROM golang:1.24-alpine AS build

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .

RUN go build -o /go-api ./cmd/server

FROM alpine:3.20

WORKDIR /app

COPY --from=build /go-api /app/go-api

# folder untuk menyimpan PDF (di-mount dari host via volume)
RUN mkdir -p /app/storage

EXPOSE 8080

ENV PORT=8080

CMD ["/app/go-api"]
