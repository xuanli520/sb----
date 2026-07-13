# Globe Hello

A Docker Compose based Spring Boot training project. It serves one server-rendered
Thymeleaf page with a rotating ASCII globe and a HelloWorld message. The Java
backend generates each character frame and sends it to the page through Server-Sent
Events (SSE). No CDN, Canvas, WebGL, separate frontend project, or runtime external
asset is required.

## Run

```bash
MAVEN_OPTS=-Djava.net.preferIPv4Stack=true mvn --batch-mode --no-transfer-progress package
docker compose up --build
```

The JAR is assembled by the configured WSL Java/Maven toolchain and Docker
Compose is the application runtime. This keeps the runtime image small and
avoids dependency downloads while the container starts.

Open `http://localhost:8080`, then stop the service with:

```bash
docker compose down
```

Use another host port when 8080 is busy:

```bash
APP_PORT=8081 docker compose up --build
```

## Local development

The WSL toolchain is OpenJDK 21 and Maven 3.9.9. A global shell profile is
installed at `/etc/profile.d/java-maven.sh` so a new login shell receives
`JAVA_HOME`, `MAVEN_HOME`, and `M2_HOME` automatically.

The project includes a credential-free Maven mirror in `.mvn/settings.xml`; Maven
loads it automatically through `.mvn/maven.config` for repeatable dependency
downloads in this WSL environment.

```bash
mvn test
mvn spring-boot:run
```

## Project layout

```text
src/main/java/       Spring Boot application and MVC controllers
src/main/resources/  Thymeleaf template, CSS, and locally served JavaScript
Dockerfile           Multi-stage production image build
compose.yaml         Standard runtime entry point
```

## Visual references and licensing

The ASCII globe renderer was independently implemented after researching the
mathematical terminal-animation approach in C and the classic rotating-planet
visual treatment in Xplanet. No third-party source code, image, or graphics
library is included. The renderer uses original procedural continent, cloud,
lighting, and latitude/longitude rules to compose ASCII characters server-side.

- https://www.a1k0n.net/2011/07/20/donut-math.html
- https://xplanet.sourceforge.io/
