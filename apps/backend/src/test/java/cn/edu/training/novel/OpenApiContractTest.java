package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Keeps the checked-in contract honest without adding a runtime Swagger dependency. The JSON
 * artifact is deliberately outside the application classpath so the docs remain the source of
 * truth for both backend and BFF consumers.
 */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:openapi_contract_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@SuppressWarnings("deprecation")
class OpenApiContractTest {
    private static final Set<String> HTTP_OPERATIONS = Set.of("get", "post", "put", "patch", "delete");
    private static final String CONTRACT_FILE = "docs/openapi/novel-platform.openapi.json";

    @Autowired
    RequestMappingHandlerMapping requestMappingHandlerMapping;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void checkedInContractIsParseableAndCoversEveryBackendRoute() throws Exception {
        JsonNode contract = objectMapper.readTree(Files.readString(findContract()));

        assertThat(contract.path("openapi").asText()).startsWith("3.1.");
        assertThat(contract.path("info").path("title").asText()).isNotBlank();
        assertThat(contract.path("paths").isObject()).isTrue();
        assertLocalReferencesResolve(contract, contract, "$");

        Set<Route> documentedRoutes = documentedRoutes(contract);
        Set<Route> runtimeRoutes = runtimeRoutes();

        assertThat(documentedRoutes)
                .as("every @RequestMapping below /api/v1 must be documented")
                .containsAll(runtimeRoutes);
        assertThat(runtimeRoutes)
                .as("the contract must not declare a backend operation which has no controller mapping")
                .containsAll(documentedRoutes);
    }

    private Set<Route> documentedRoutes(JsonNode contract) {
        Set<Route> routes = new LinkedHashSet<>();
        Set<String> operationIds = new HashSet<>();
        Iterator<Map.Entry<String, JsonNode>> paths = contract.path("paths").fields();
        while (paths.hasNext()) {
            Map.Entry<String, JsonNode> path = paths.next();
            assertThat(path.getKey()).startsWith("/api/v1/");
            Iterator<Map.Entry<String, JsonNode>> operations = path.getValue().fields();
            while (operations.hasNext()) {
                Map.Entry<String, JsonNode> operation = operations.next();
                if (!HTTP_OPERATIONS.contains(operation.getKey())) {
                    continue;
                }
                JsonNode definition = operation.getValue();
                String operationId = definition.path("operationId").asText();
                assertThat(operationId)
                        .as("operationId for %s %s", operation.getKey(), path.getKey())
                        .isNotBlank();
                assertThat(operationIds.add(operationId))
                        .as("operationIds must remain unique")
                        .isTrue();
                assertThat(definition.path("responses").has("200"))
                        .as("successful response for %s %s", operation.getKey(), path.getKey())
                        .isTrue();
                assertLocalSchemaReference(contract, definition.path("x-response-data-schema"), operationId);
                routes.add(new Route(path.getKey(), operation.getKey()));
            }
        }
        assertThat(routes).isNotEmpty();
        return routes;
    }

    private Set<Route> runtimeRoutes() {
        return requestMappingHandlerMapping.getHandlerMethods().entrySet().stream()
                .filter(entry -> entry.getKey().getPatternValues().stream().anyMatch(path -> path.startsWith("/api/v1/")))
                .flatMap(entry -> routesFor(entry.getKey(), entry.getValue()).stream())
                .filter(route -> route.path().startsWith("/api/v1/"))
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static Set<Route> routesFor(RequestMappingInfo mapping, HandlerMethod ignoredHandler) {
        Set<RequestMethod> methods = mapping.getMethodsCondition().getMethods();
        if (methods.isEmpty()) {
            fail("API mapping must declare an HTTP method: " + mapping);
        }
        Set<Route> routes = new LinkedHashSet<>();
        for (String path : mapping.getPatternValues()) {
            for (RequestMethod method : methods) {
                routes.add(new Route(path, method.name().toLowerCase()));
            }
        }
        return routes;
    }

    private static void assertLocalSchemaReference(JsonNode contract, JsonNode reference, String operationId) {
        assertThat(reference.isTextual())
                .as("response data schema for %s", operationId)
                .isTrue();
        String prefix = "#/components/schemas/";
        String value = reference.asText();
        assertThat(value)
                .as("response data schema reference for %s", operationId)
                .startsWith(prefix);
        assertThat(contract.path("components").path("schemas").has(value.substring(prefix.length())))
                .as("response data schema target for %s", operationId)
                .isTrue();
    }

    private static void assertLocalReferencesResolve(JsonNode root, JsonNode current, String location) {
        if (current.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = current.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if ("$ref".equals(field.getKey())) {
                    assertThat(field.getValue().isTextual())
                            .as("$ref at %s", location)
                            .isTrue();
                    String reference = field.getValue().asText();
                    if (reference.startsWith("#/")) {
                        assertThat(root.at(reference.substring(1)).isMissingNode())
                                .as("local reference %s at %s", reference, location)
                                .isFalse();
                    }
                }
                assertLocalReferencesResolve(root, field.getValue(), location + "." + field.getKey());
            }
        } else if (current.isArray()) {
            for (int index = 0; index < current.size(); index++) {
                assertLocalReferencesResolve(root, current.get(index), location + "[" + index + "]");
            }
        }
    }

    private static Path findContract() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (current != null) {
            Path candidate = current.resolve(CONTRACT_FILE);
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("cannot find " + CONTRACT_FILE + " from " + System.getProperty("user.dir"));
    }

    private record Route(String path, String method) {}
}
