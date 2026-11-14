package com.lagradost.cloudstream3

/** The app's key store, as the providers use it; on GitHub it lives only while the run lasts. */
class CloudStreamApp {
    companion object {
        private val store = java.util.concurrent.ConcurrentHashMap<String, Any>()
        @Suppress("UNCHECKED_CAST")
        fun <T> getKey(path: String): T? = store[path] as T?
        @Suppress("UNCHECKED_CAST")
        fun <T> getKey(folder: String, path: String): T? = store["$folder/$path"] as T?
        fun <T> setKey(path: String, value: T) { if (value == null) store.remove(path) else store[path] = value as Any }
        fun <T> setKey(folder: String, path: String, value: T) = setKey("$folder/$path", value)
        fun removeKey(path: String) { store.remove(path) }
    }
}
