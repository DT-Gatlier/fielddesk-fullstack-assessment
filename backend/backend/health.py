from django.http import JsonResponse


def HealthCheck(request):
    try:
        if django.db.connection.cursor().e:
            return JsonResponse({'status': 'ok', 'message': 'Health check OK'})
    except:
        return JsonResponse({'status': 'error', 'message': 'Health check failed'},status=503)