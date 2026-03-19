package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &Client{
		baseURL:    srv.URL,
		apiKey:     "remb_test_key_12345678",
		httpClient: srv.Client(),
	}
}

func TestSaveContext(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/api/cli/context/save" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer remb_test_key_12345678" {
			t.Errorf("missing auth header")
		}

		var req SaveContextRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if req.ProjectSlug != "test-project" {
			t.Errorf("expected slug test-project, got %s", req.ProjectSlug)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(SaveContextResponse{
			ID:          "ctx-123",
			FeatureName: req.FeatureName,
			CreatedAt:   "2026-01-01T00:00:00Z",
		})
	})

	resp, err := client.SaveContext(SaveContextRequest{
		ProjectSlug: "test-project",
		FeatureName: "auth",
		Content:     "Auth uses JWT tokens",
		EntryType:   "knowledge",
	})
	if err != nil {
		t.Fatalf("SaveContext: %v", err)
	}
	if resp.ID != "ctx-123" {
		t.Errorf("expected id ctx-123, got %s", resp.ID)
	}
}

func TestGetContext(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET, got %s", r.Method)
		}
		slug := r.URL.Query().Get("projectSlug")
		if slug != "my-project" {
			t.Errorf("expected slug my-project, got %s", slug)
		}

		json.NewEncoder(w).Encode(GetContextResponse{
			Entries: []ContextEntry{
				{ID: "e1", Feature: "auth", Content: "Uses JWT"},
				{ID: "e2", Feature: "auth", Content: "Supports OAuth"},
			},
			Total: 2,
		})
	})

	resp, err := client.GetContext("my-project", "auth", 10)
	if err != nil {
		t.Fatalf("GetContext: %v", err)
	}
	if len(resp.Entries) != 2 {
		t.Errorf("expected 2 entries, got %d", len(resp.Entries))
	}
	if resp.Entries[0].Content != "Uses JWT" {
		t.Errorf("unexpected content: %s", resp.Entries[0].Content)
	}
}

func TestCreateMemory(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		var req CreateMemoryRequest
		json.NewDecoder(r.Body).Decode(&req)
		if req.Title == "" {
			t.Error("title should not be empty")
		}

		json.NewEncoder(w).Encode(CreateMemoryResponse{
			ID:         "mem-1",
			Tier:       req.Tier,
			Category:   req.Category,
			Title:      req.Title,
			TokenCount: 42,
			CreatedAt:  "2026-01-01T00:00:00Z",
		})
	})

	resp, err := client.CreateMemory(CreateMemoryRequest{
		Title:    "Test Pattern",
		Content:  "Always use dependency injection",
		Tier:     "core",
		Category: "pattern",
	})
	if err != nil {
		t.Fatalf("CreateMemory: %v", err)
	}
	if resp.ID != "mem-1" {
		t.Errorf("expected id mem-1, got %s", resp.ID)
	}
	if resp.Tier != "core" {
		t.Errorf("expected tier core, got %s", resp.Tier)
	}
}

func TestAPIError(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid API key"})
	})

	_, err := client.ListMemories(nil)
	if err == nil {
		t.Fatal("expected error for 401")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.StatusCode != 401 {
		t.Errorf("expected status 401, got %d", apiErr.StatusCode)
	}
	if apiErr.Message != "Invalid API key" {
		t.Errorf("unexpected message: %s", apiErr.Message)
	}
}

func TestSaveBatch(t *testing.T) {
	var callCount int
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		callCount++
		var req SaveContextRequest
		json.NewDecoder(r.Body).Decode(&req)
		json.NewEncoder(w).Encode(SaveContextResponse{
			ID:          "batch-" + req.FeatureName,
			FeatureName: req.FeatureName,
			CreatedAt:   "2026-01-01T00:00:00Z",
		})
	})

	entries := []SaveContextRequest{
		{FeatureName: "a", Content: "content a", EntryType: "scan"},
		{FeatureName: "b", Content: "content b", EntryType: "scan"},
		{FeatureName: "c", Content: "content c", EntryType: "scan"},
	}
	results, err := client.SaveBatch("test-project", entries)
	if err != nil {
		t.Fatalf("SaveBatch: %v", err)
	}
	if len(results) != 3 {
		t.Errorf("expected 3 results, got %d", len(results))
	}
	if callCount != 3 {
		t.Errorf("expected 3 API calls, got %d", callCount)
	}
}
